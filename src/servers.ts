/**
 * The published Harbor deployment: which servers to ask, and whose verification to trust.
 *
 * These are Harbor's own values, read from `globalThis.__HARBOR_ENV__` in the page served at
 * <https://harbor.social> — `EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS` and
 * `EXPO_PUBLIC_POLYCENTRIC_VERIFIER_SERVERS`. They are defaults, not the only possible values;
 * Polycentric is federated, and `HarborOptions` takes any server.
 */

/** Harbor's public Polycentric servers. The first that answers is used. */
export const HARBOR_SEED_SERVERS = [
  'https://srv.harbor.social',
  'https://srv.polycentric.io',
] as const;

/** Harbor's verifier service, which publishes the identity it signs verifications with. */
export const HARBOR_VERIFIER_SERVER = 'https://verifier-bot.harbor.social';

/**
 * The identity whose `VerificationVerify` events make a claim "verified" on Harbor.
 *
 * Pinned rather than fetched. `GET https://verifier-bot.harbor.social/identity` returns it, and
 * that is where this value came from — but a trust root fetched at call time is only as good as
 * whoever answered that request. Pinning it means a consumer trusting this default is trusting
 * this package's source, which they can read, instead of DNS and TLS on every lookup. Use
 * `fetchVerifierIdentity()` if you would rather take the live value, or pass your own.
 */
export const HARBOR_VERIFIER_IDENTITY =
  '10e7c87651ea2a746c0db398d2a309e6ad626df2834e879a440cb402d5f51eeb';

/** The shape the verifier service answers `/identity` with. */
interface IdentityResponse {
  identity?: unknown;
}

/**
 * Read the verifier service's current identity over HTTP.
 *
 * Only useful for noticing that `HARBOR_VERIFIER_IDENTITY` has gone stale, or for pinning a
 * different verifier's. A lookup does not call this.
 */
export async function fetchVerifierIdentity(
  server: string = HARBOR_VERIFIER_SERVER,
  options: { signal?: AbortSignal; fetch?: typeof fetch } = {},
): Promise<string> {
  const call = options.fetch ?? globalThis.fetch;
  const url = new URL('/identity', server);
  const response = await call(url, options.signal ? { signal: options.signal } : {});

  if (!response.ok) {
    throw new Error(`The verifier at ${server} answered ${String(response.status)} for /identity.`);
  }

  const body = (await response.json()) as IdentityResponse;

  if (typeof body.identity !== 'string' || body.identity === '') {
    throw new Error(`The verifier at ${server} did not return an identity.`);
  }

  return body.identity;
}
