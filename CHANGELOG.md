# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-10-05

First release.

### Added

- **`Harbor.linkedSocials(query)`** — one social account in, the accounts verifiably linked to it
  out. Two unary calls: `ResolveVerifiedClaims` to get from a claimed account to the identity that
  claims it, then `ListVerificationClaims` for everything else that identity has had verified.
  Also `linkedIdentities()` where the grouping matters, `resolveIdentities()` for just the
  identity, and `socialsOf()` when you already have one.
- **A verifier filter on both halves of the lookup.** `ListVerificationClaims` takes no verifier
  argument and returns an identity's claims whether anyone vouched for them, so without this the
  second call would quietly widen a verified result to self-asserted ones. Configurable; defaults
  to Harbor's verifier, whose identity is pinned rather than fetched.
- **Claim decoding** — a bundle does not hand you a claim, it hands you a signed event whose body
  is a separately serialized `Content` whose claim carries its own schema inline. All four
  `FieldKind` encodings are implemented from the proto's canonical-bytes rule, including the three
  nothing currently publishes, and a field whose schema declares no kind is dropped rather than
  guessed at.
- **Server failover** on the statuses that mean the server could not serve the request, and not on
  the ones that answer it — a federated `NOT_FOUND` is the same from every server.
- **Typed errors** — `HarborError` and `RpcError` / `TransportError` / `QueryError` /
  `DecodeError`, which distinguish "no answer", "an answer you did not want", "a query that cannot
  mean anything" and "a response that is not the shape the schema says".
- **grpc-web over `fetch`**, in both framings, verified against the live server. Works in a browser
  with no proxy; `srv.harbor.social` answers the preflight with `access-control-allow-origin: *`.
  `fetch` is replaceable.
- **The whole `polycentric.v2` schema generated**, not just the two calls wrapped here, so a
  consumer who needs another service can build a client from the exported `v2` types rather than
  vendoring the protos again.
- **Tests that replay real wire bytes.** `tools/record-fixtures.ts` captures actual grpc-web
  responses from `srv.harbor.social` into `test/fixtures/`, and the offline suite decodes those. A
  hand-built fixture would only prove the decoder agrees with whoever wrote the fixture.

### Notes

- `.proto` definitions are vendored from [futo-org/Harbor](https://github.com/futo-org/Harbor) at
  a pinned commit by `tools/fetch-protos.sh`, and generated with `protoc-gen-ts` — the same
  generator Harbor's own `js-core` uses, so these types are not a second dialect of the schema.
- The generated tree carries `@ts-nocheck`, per generated file. protobuf-ts output does not
  compile under this project's `noImplicitOverride` / `noUncheckedIndexedAccess` /
  `exactOptionalPropertyTypes`, and it is regenerated on every `npm run generate`. Exported types
  stay intact, so every call site in `src/` is checked against them as strictly as before.
  `src/generated/` is also not linted — some 2500 findings, none of them anyone's to act on. Both
  exemptions are scoped to that directory and explained where they are configured.
- **No skipped tests in the default run.** The live suite is a separate config and npm script
  (`npm run test:live`) rather than a suite that skips itself when the network is absent.
- The headline caveat, which is in the README twice on purpose: Harbor's dataset is opt-in and
  small, so most lookups return nothing. That is enrichment, not a resolver.
- `schema_digest` is deliberately left unset on the query. Upstream's own schema helper carries a
  TODO saying re-serialization is not yet canonical, so a digest filter would drop claims that
  describe the same thing with different bytes.

[0.1.0]: https://github.com/Bluscream/harbor-lookup-ts/releases/tag/v0.1.0
