/**
 * harbor-lookup — give it one social account, get back the accounts verifiably linked to it.
 *
 * ```ts
 * import { Harbor } from 'harbor-lookup';
 *
 * const harbor = new Harbor();
 * const socials = await harbor.linkedSocials({ platform: 'youtube', account: 'asphaltstorm96' });
 * ```
 */
export { Harbor, type CallOptions, type HarborOptions, type LinkedIdentity } from './harbor.js';

export {
  isKnownPlatform,
  PLATFORM_NAMES,
  PLATFORM_SCHEMA_NAME,
  PLATFORM_SLUGS,
  type PlatformSlug,
  type Social,
  type SocialQuery,
} from './social.js';

export {
  fetchVerifierIdentity,
  HARBOR_SEED_SERVERS,
  HARBOR_VERIFIER_IDENTITY,
  HARBOR_VERIFIER_SERVER,
} from './servers.js';

export { decodeClaimBundle, type DecodedClaim } from './claims.js';

export { DecodeError, HarborError, QueryError, RpcError, TransportError } from './errors.js';

/**
 * The generated Polycentric types, for reaching past this package's surface.
 *
 * `Harbor` covers the two verification calls and nothing else. The full `polycentric.v2` schema is
 * generated here, so a consumer who needs another service can build a client from these rather
 * than vendoring the protos a second time.
 */
export * as v2 from './generated/polycentric/v2/verifications_service.js';
export { VerificationsServiceClient } from './generated/polycentric/v2/verifications_service.client.js';
