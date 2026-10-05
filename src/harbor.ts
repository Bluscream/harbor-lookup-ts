/**
 * The client: one social account in, the accounts verifiably linked to it out.
 */
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import {
  RpcError as GrpcError,
  type RpcOptions,
  type RpcTransport,
} from '@protobuf-ts/runtime-rpc';

import { decodeClaimBundle, type DecodedClaim } from './claims.js';
import { QueryError, RpcError, TransportError } from './errors.js';
import { VerificationsServiceClient } from './generated/polycentric/v2/verifications_service.client.js';
import type { VerificationClaimBundle } from './generated/polycentric/v2/verifications_service.js';
import { HARBOR_SEED_SERVERS, HARBOR_VERIFIER_IDENTITY } from './servers.js';
import {
  PLATFORM_SCHEMA_NAME,
  queryFields,
  toSocial,
  type Social,
  type SocialQuery,
} from './social.js';

/** How to reach Harbor, and whose verification to believe. */
export interface HarborOptions {
  /**
   * Polycentric servers to query, tried in order until one answers.
   *
   * Defaults to Harbor's published seed servers.
   */
  readonly servers?: readonly string[];
  /**
   * Identities whose `VerificationVerify` events count as proof.
   *
   * Defaults to Harbor's verifier. The server requires at least one: a claim with no verification
   * from a trusted identity is something a stranger asserted about themselves, and this package
   * will not report it as a link.
   */
  readonly verifiers?: readonly string[];
  /** A `fetch` to use instead of the global one — for a proxy, instrumentation, or a test. */
  readonly fetch?: typeof fetch;
  /**
   * `text` (the default) base64-encodes frames, which is what a browser needs without a
   * grpc-web proxy in front. `binary` is smaller where the server and runtime both allow it.
   */
  readonly format?: 'text' | 'binary';
}

/** Per-call options. */
export interface CallOptions {
  readonly signal?: AbortSignal;
  /**
   * Keep claims whose schema is not the platform one.
   *
   * Off by default: a lookup asks about social accounts, and Polycentric claims are not limited
   * to those — a `Skill` claim is a real thing people publish. Turn this on to see all of them.
   */
  readonly allSchemas?: boolean;
}

/** A looked-up identity and the socials it claims. */
export interface LinkedIdentity {
  readonly identity: string;
  readonly socials: readonly Social[];
}

export class Harbor {
  private readonly servers: readonly string[];
  private readonly verifiers: readonly string[];
  private readonly clients: readonly { server: string; client: VerificationsServiceClient }[];

  constructor(options: HarborOptions = {}) {
    this.servers = options.servers ?? HARBOR_SEED_SERVERS;
    this.verifiers = options.verifiers ?? [HARBOR_VERIFIER_IDENTITY];

    if (this.servers.length === 0) {
      throw new QueryError('No servers to query. Leave `servers` unset for Harbor’s own.');
    }

    if (this.verifiers.length === 0) {
      throw new QueryError(
        'No verifier identities. Without a trust root every self-made claim would look verified.',
      );
    }

    this.clients = this.servers.map((server) => ({
      server,
      client: new VerificationsServiceClient(transportFor(server, options)),
    }));
  }

  /**
   * The accounts linked to the one you asked about.
   *
   * Every claim this returns was verified by one of the configured verifiers. The account you
   * queried is included — it is one of the identity's claims like any other — so filter it out if
   * you only want the others.
   *
   * An unknown account is an empty array, not an error. Harbor's dataset is opt-in and small, so
   * that is the common answer for an arbitrary channel.
   */
  async linkedSocials(query: SocialQuery, options: CallOptions = {}): Promise<Social[]> {
    const identities = await this.linkedIdentities(query, options);

    return identities.flatMap((identity) => identity.socials);
  }

  /**
   * As `linkedSocials`, but keeping the grouping by identity.
   *
   * Two identities can claim the same account — one of them falsely, or the account changed
   * hands. Flattening hides that; this does not.
   */
  async linkedIdentities(query: SocialQuery, options: CallOptions = {}): Promise<LinkedIdentity[]> {
    const identities = await this.resolveIdentities(query, options);
    const results: LinkedIdentity[] = [];

    for (const identity of identities) {
      results.push({ identity, socials: await this.socialsOf(identity, options) });
    }

    return results;
  }

  /**
   * The identities that claim the queried account, verified by a trusted verifier.
   *
   * The first half of the lookup on its own, for when the identity is what you want.
   */
  async resolveIdentities(query: SocialQuery, options: CallOptions = {}): Promise<string[]> {
    const fields = queryFields(query);

    if (Object.keys(fields).length === 0) {
      throw new QueryError(
        'An empty query would match every verified claim. Give at least a platform and an account.',
      );
    }

    const response = await this.call(
      (client, rpc) =>
        // `schema_digest` is left unset, which the field documents as "any schema". Pinning one
        // would only group claims whose authors serialized byte-identical schema bytes, and
        // upstream's own schema helper has a TODO saying it does not guarantee that yet.
        client.resolveVerifiedClaims({ fields, verified_by_identities: [...this.verifiers] }, rpc)
          .response,
      options,
    );

    const identities = new Set<string>();

    for (const claim of this.claimsIn(response.claim_bundles, options)) {
      identities.add(claim.identity);
    }

    return [...identities];
  }

  /** Every verified social an identity claims. */
  async socialsOf(identity: string, options: CallOptions = {}): Promise<Social[]> {
    if (identity === '') {
      throw new QueryError('An empty identity cannot be looked up.');
    }

    const response = await this.call(
      (client, rpc) =>
        client.listVerificationClaims({ claimed_by_identity: identity }, rpc).response,
      options,
    );

    return this.claimsIn(response.claim_bundles, options).map((claim) =>
      toSocial(claim.identity, claim.fields, claim.verifiedBy),
    );
  }

  /**
   * Decode the bundles worth keeping: platform claims, verified by a configured verifier.
   *
   * The verifier filter is applied again here even though the server was asked to apply it.
   * `ResolveVerifiedClaims` filters, but `ListVerificationClaims` takes no verifier argument at
   * all and returns an identity's claims whether anyone vouched for them — so without this, the
   * second half of the lookup would quietly widen the result to self-asserted claims.
   */
  private claimsIn(
    bundles: readonly VerificationClaimBundle[],
    options: CallOptions,
  ): DecodedClaim[] {
    const trusted = new Set(this.verifiers);
    const claims: DecodedClaim[] = [];

    for (const bundle of bundles) {
      const claim = decodeClaimBundle(bundle);

      if (claim === undefined) continue;
      if (options.allSchemas !== true && claim.schemaName !== PLATFORM_SCHEMA_NAME) continue;

      const verifiedBy = claim.verifiedBy.filter((identity) => trusted.has(identity));

      if (verifiedBy.length > 0) {
        claims.push({ ...claim, verifiedBy });
      }
    }

    return claims;
  }

  /**
   * Run a call against each server until one gives an answer about the request.
   *
   * A second server is only worth asking when the first failed to serve the request at all. The
   * servers federate the same data, so re-asking after `NOT_FOUND` or `INVALID_ARGUMENT` gets the
   * same answer more slowly.
   *
   * The split has to be made on the status rather than on "did it throw", because the grpc-web
   * transport turns a failed `fetch` into a gRPC error of its own with code `INTERNAL` — so a
   * server that is simply unreachable arrives here looking exactly like a server that replied.
   */
  private async call<T>(
    invoke: (client: VerificationsServiceClient, options: RpcOptions) => Promise<T>,
    options: CallOptions,
  ): Promise<T> {
    const rpc: RpcOptions = options.signal ? { abort: options.signal } : {};
    let lastFailure: Error | undefined;

    for (const { server, client } of this.clients) {
      try {
        return await invoke(client, rpc);
      } catch (error) {
        // An abort is the caller's decision, not a server problem, and must not look like one.
        if (options.signal?.aborted === true) throw error;

        const failure = asFailure(error, server);

        if (failure instanceof RpcError && !RETRY_ANOTHER_SERVER.has(failure.code)) throw failure;

        lastFailure = failure;
      }
    }

    // `lastFailure` is always set here: the loop ran at least once, since the constructor
    // rejects an empty server list, and every path through the catch assigns it.
    throw lastFailure ?? new QueryError('No servers were tried.');
  }
}

/**
 * gRPC statuses that say "this server could not serve it", as opposed to answering the request.
 *
 * `INTERNAL` is in the list because the transport uses it for a failed `fetch`; a genuine
 * server-side `INTERNAL` costs one extra request to the next server, which is the right way round
 * to be wrong.
 */
const RETRY_ANOTHER_SERVER = new Set(['UNAVAILABLE', 'UNKNOWN', 'INTERNAL', 'DEADLINE_EXCEEDED']);

/** Wrap whatever a call threw into this package's error types. */
function asFailure(error: unknown, server: string): Error {
  if (error instanceof GrpcError) {
    return new RpcError(`${server} answered ${error.code}: ${error.message}`, error.code, server, {
      cause: error,
    });
  }

  // Reached when the transport does not wrap — a custom `fetch` rejecting with something it does
  // not recognise, for instance.
  return new TransportError(`${server} could not be reached.`, server, { cause: error });
}

function transportFor(server: string, options: HarborOptions): RpcTransport {
  return new GrpcWebFetchTransport({
    baseUrl: server,
    format: options.format ?? 'text',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}
