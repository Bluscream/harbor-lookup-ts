# harbor-lookup

Give it one social account, get back the other accounts verifiably linked to it.

```ts
import { Harbor } from 'harbor-lookup';

const harbor = new Harbor();
const socials = await harbor.linkedSocials({ platform: 'youtube', account: '@asphaltstorm96' });

for (const social of socials) {
  console.log(social.platformName, social.account, social.url);
}
// YouTube  @asphaltstorm96   https://www.youtube.com/@asphaltstorm96
// YouTube  @shadowstorm_96   https://www.youtube.com/@shadowstorm_96
// Twitch   asphaltstorm96    https://www.twitch.tv/asphaltstorm96
// Twitch   shadowstorm0896   https://www.twitch.tv/shadowstorm0896
// X        asphaltstorm96    https://x.com/asphaltstorm96
// X        shadowstorm_96    https://x.com/shadowstorm_96
```

```bash
npm install harbor-lookup
```

Zero configuration: it talks to [Harbor](https://harbor.social)'s public servers and trusts
Harbor's verifier by default. No key, no account, no sign-up.

## What this actually tells you

Harbor is a client for **Polycentric**, a federated identity network. People publish a _claim_
("this YouTube channel is mine"), a verifier checks it by looking for a one-time token in the
account's own bio or channel description, and publishes a signed _verification_. This package
runs that index backwards: from one claimed account to the identity that claims it, and from
there to everything else that identity has had verified.

So a result is not "these accounts look similar" or "these usernames match". It is "the person who
controls this YouTube channel also demonstrated control of these, and a verifier you named signed
off on it". That is a much stronger claim than username enumeration, and a much rarer one.

> [!IMPORTANT]
> **Most lookups return nothing, and that is the expected answer.** Harbor's dataset is opt-in and
> small. An arbitrary YouTube channel is almost certainly not in it. Treat this as enrichment that
> is occasionally very good, never as a resolver you can depend on.

## The API

```ts
const harbor = new Harbor(options?);
```

| Method                            | Returns                                                                           |
| :-------------------------------- | :-------------------------------------------------------------------------------- |
| `linkedSocials(query, opts?)`     | `Social[]` — every verified account on the identities that claim the queried one. |
| `linkedIdentities(query, opts?)`  | The same, grouped by identity, for when two identities claim the same account.    |
| `resolveIdentities(query, opts?)` | `string[]` — just the identities, when that is all you need.                      |
| `socialsOf(identity, opts?)`      | `Social[]` — every verified account one identity claims.                          |

A query is a platform plus whichever identifier that platform's claims record:

```ts
await harbor.linkedSocials({ platform: 'youtube', accountId: 'UC1-QO9dEJxK05SAEM02bxkQ' });
await harbor.linkedSocials({ platform: 'twitch', account: 'asphaltstorm96' });
await harbor.linkedSocials({ platform: 'website', fields: { url: 'https://example.com' } });
```

Matching is **containment**: a claim matches when it holds every pair you gave, and may carry more.
A claim missing one of them does not match — so `accountId` finds nothing on a platform whose
claims only record a handle. `PLATFORM_SLUGS` lists the platforms Harbor's verifier has a route
for (`x`, `youtube`, `github`, `discord`, `hacker-news`, `rumble`, `twitch`, `website`), and the
field accepts a slug added after this release.

The account you queried comes back too — it is one of the identity's claims like any other. Filter
it out if you only want the others.

### Options

```ts
new Harbor({
  servers: ['https://srv.harbor.social'], // defaults to Harbor's published seed servers
  verifiers: [HARBOR_VERIFIER_IDENTITY], // whose signature counts as verification
  fetch: myFetch, // for a proxy, instrumentation, or a test
  format: 'binary', // 'text' (default) is what a browser needs
});

await harbor.linkedSocials(query, { signal: AbortSignal.timeout(5000), allSchemas: true });
```

`verifiers` is the security-relevant one. A Polycentric claim is just an assertion until somebody
signs a verification of it, and `ListVerificationClaims` — the second half of the lookup — takes no
verifier argument and will happily return an identity's unverified claims. This package filters
them out against `verifiers` on both halves. Set it to a verifier you trust, or leave it as
Harbor's.

### Errors

`HarborError` is the base. `RpcError` carries the gRPC `code` and the server that answered;
`TransportError` means no answer at all; `QueryError` rejects a query that cannot mean anything (an
empty one would match every verified claim there is); `DecodeError` means the response was not the
shape the schema says — a protocol mismatch rather than a failed lookup.

Servers are tried in order, and a second one is only asked when the first failed to _serve_ the
request. `NOT_FOUND` from one federated server is `NOT_FOUND` from all of them.

## What a `Social` is

```ts
interface Social {
  platform: PlatformSlug; // 'youtube'
  platformName: string; // 'YouTube'
  account?: string; // '@asphaltstorm96'
  accountId?: string; // 'UC1-QO9dEJxK05SAEM02bxkQ' — where the platform has stable ids
  url?: string; // the url the claim recorded; not built here
  identity: string; // the Polycentric identity that claims it
  verifiedBy: string[]; // which of your trust roots signed it
  fields: Record<string, string>; // every field the claim carries
}
```

**Read `fields` when you need something the named properties do not cover.** A verification schema
is defined per claim by whoever makes it, so the fields vary: YouTube claims carry
`platform` / `account` / `account_id` / `url`, while X claims carry no id at all. The named
properties are the common ones, not the whole claim.

## Caveats worth reading before you build on this

- **Coverage.** Said above, worth repeating: usually empty.
- **Schemas are per-claim and user-definable.** There is no guarantee about which fields exist.
  Harbor's own schema helper carries a TODO noting that re-serializing a schema does not yet
  produce canonical bytes, which is why this package does not filter by `schema_digest` — digests
  only group claims across clients when the claimants pinned identical bytes.
- **Verification means "a verifier found a token in the bio"**, which proves control of the account
  at the time it was checked. It does not prove the account was not later sold, nor that the two
  accounts belong to the same human rather than the same team.
- **gRPC, not REST.** Polycentric v2 has no JSON transcoding; the old v1 REST paths
  (`find_claim_and_vouch` and friends) are gone from these servers. This package speaks grpc-web
  over `fetch`, so it works in a browser and in Node 20+ with nothing native.

## Browser use

Works as-is, with no grpc-web proxy in front. `srv.harbor.social` answers the preflight with
`access-control-allow-origin: *` and allows `POST` with `content-type, x-grpc-web, grpc-timeout,
authorization`, so a page on any origin can call it. Both framings were checked against the live
server: the default `format: 'text'` base64-encodes frames and carries the gRPC status in the body,
and `'binary'` works too. Nothing in the package touches `node:` modules at runtime.

## Where the types come from

`proto/` holds the `polycentric.v2` definitions, vendored from
[futo-org/Harbor](https://github.com/futo-org/Harbor) at a pinned commit, and `src/generated/` is
`protoc-gen-ts` output from them — the same generator Harbor's own `js-core` uses, so these types
are not a second dialect of the same schema. Refresh with `./tools/fetch-protos.sh develop` and
`npm run generate`, then read the diff.

The whole schema is generated, not just the two calls this package wraps, so a consumer who needs
another Polycentric service can build a client from `v2` and `VerificationsServiceClient` rather
than vendoring the protos again. The package is `sideEffects: false`, so a bundler drops what you
do not import.

## Why not the official client?

`@polycentric/js-core` exists in the Harbor monorepo, with `js-node` and `js-browser` on top. Two
reasons it is not used here: none of them are published to npm (all `0.0.0`, `workspace:*`), and
`js-node`'s `createPolycentricNodeClient` wants sqlite or postgres, a blob directory and a wasm
core before it will start, because it is a full replicating node. This package makes two unary
calls and keeps no state. If you need to _publish_ events rather than read them, use theirs.

## Development

```bash
npm install
npm run check        # format → lint → typecheck → test → build
npm test             # the offline suite — replayed fixtures, no network
npm run test:live    # against srv.harbor.social, read-only
```

The offline tests replay **real** grpc-web response bytes recorded from `srv.harbor.social` into
`test/fixtures/` by `npm run record-fixtures`, so they exercise the actual decoder against actual
server output. There are no skipped tests in the default run; the live suite is a separate script
rather than a suite that skips itself.

## License

MIT. The vendored `.proto` files are Harbor's, under the license in
[their repository](https://github.com/futo-org/Harbor).
