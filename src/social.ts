/**
 * The domain types: a social account, and the platforms Harbor can verify one on.
 *
 * Every platform claim on Harbor shares a single verification schema named `Platform`; which
 * platform a claim is for is carried by the claim's own `platform` field, not by the schema.
 * See `services/verifier-bot/src/claims.ts` and
 * `apps/harbor/src/features/verifications/utils/platforms.ts` upstream.
 */

/** The verification schema name every platform claim uses. Upstream's `PLATFORM_SCHEMA_NAME`. */
export const PLATFORM_SCHEMA_NAME = 'Platform';

/**
 * The platform slugs Harbor's verifier has a route for, mirroring upstream's `PLATFORMS`.
 *
 * `website` is the catch-all for a site with no dedicated route.
 */
export const PLATFORM_SLUGS = [
  'x',
  'youtube',
  'github',
  'discord',
  'hacker-news',
  'rumble',
  'twitch',
  'website',
] as const;

/**
 * A platform slug.
 *
 * Open: the slugs above are the ones that exist today, but the field is a free-form string on the
 * wire and a new verifier route needs no schema change. Writing it this way keeps the known slugs
 * as editor completions while still accepting one added after this release.
 */
export type PlatformSlug = (typeof PLATFORM_SLUGS)[number] | (string & Record<never, never>);

/** Human-readable names for the known slugs, as Harbor labels them. */
export const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  x: 'X',
  youtube: 'YouTube',
  github: 'GitHub',
  discord: 'Discord',
  'hacker-news': 'Hacker News',
  rumble: 'Rumble',
  twitch: 'Twitch',
  website: 'Other',
};

/** `true` when `slug` is one of the platforms this release knows about. */
export function isKnownPlatform(slug: string): boolean {
  return (PLATFORM_SLUGS as readonly string[]).includes(slug);
}

/** One account on one platform, claimed by an identity and verified by a trusted party. */
export interface Social {
  /** The platform's slug, e.g. `youtube`. */
  readonly platform: PlatformSlug;
  /** Harbor's display name for the platform when it knows it, else the slug. */
  readonly platformName: string;
  /** The handle or account name, e.g. `asphaltstorm96`. Absent on a claim that recorded only a url. */
  readonly account: string | undefined;
  /** The platform's own stable id where the claim recorded one — a YouTube channel id, say. */
  readonly accountId: string | undefined;
  /** The profile url the claim carries. Not built by this package; absent if the claim omits it. */
  readonly url: string | undefined;
  /** The Polycentric identity that claims this account. */
  readonly identity: string;
  /** Identities that published a `VerificationVerify` for this claim, filtered to the trust roots. */
  readonly verifiedBy: readonly string[];
  /**
   * Every field the claim carries, decoded, including ones above.
   *
   * The schema is per-claim and user-definable, so a claim may hold fields this package does not
   * model. Read them from here rather than assuming the named properties are the whole claim.
   */
  readonly fields: Readonly<Record<string, string>>;
}

/** What to look up: a platform plus whichever identifier that platform's claims record. */
export interface SocialQuery {
  /** The platform slug, e.g. `youtube`. */
  readonly platform?: PlatformSlug;
  /** The handle, matched against the claim's `account` field. */
  readonly account?: string;
  /** The platform's stable id, matched against the claim's `account_id` field. */
  readonly accountId?: string;
  /**
   * Any further field/value pairs the claim must contain.
   *
   * Matching is containment: a claim matches when it holds every pair given, and may carry more.
   * A claim that is missing one of them does not match.
   */
  readonly fields?: Readonly<Record<string, string>>;
}

/**
 * Flatten a query into the field map the wire takes.
 *
 * The named properties are shorthands for field keys, which is why they collapse into the same
 * map: `platform` and `account` are ordinary claim fields, not a separate kind of filter.
 */
export function queryFields(query: SocialQuery): Record<string, string> {
  const fields: Record<string, string> = { ...query.fields };

  if (query.platform !== undefined) fields.platform = query.platform;
  if (query.account !== undefined) fields.account = query.account;
  if (query.accountId !== undefined) fields.account_id = query.accountId;

  return fields;
}

/** Build a `Social` from a decoded claim's fields. */
export function toSocial(
  identity: string,
  fields: Readonly<Record<string, string>>,
  verifiedBy: readonly string[],
): Social {
  const platform = fields.platform ?? '';

  return {
    platform,
    platformName: PLATFORM_NAMES[platform] ?? platform,
    account: fields.account,
    accountId: fields.account_id,
    url: fields.url,
    identity,
    verifiedBy,
    fields,
  };
}
