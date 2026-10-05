/**
 * Against the real servers. Run with `npm run test:live`.
 *
 * Read-only: these are lookups of public verified claims, and nothing here publishes an event.
 * They are not in the default gate because they need the network and because they assert against
 * live data, which a stranger can change by editing their own profile.
 */
import { describe, expect, it } from 'vitest';

import { fetchVerifierIdentity, Harbor, HARBOR_VERIFIER_IDENTITY } from '../../src/index.js';

/** A public channel with six verified claims across three platforms. */
const CHANNEL_ID = 'UC1-QO9dEJxK05SAEM02bxkQ';

describe('srv.harbor.social', () => {
  it('still publishes the verifier identity this package pins', async () => {
    // The one test that would catch the trust root rotating out from under the pinned constant.
    await expect(fetchVerifierIdentity()).resolves.toBe(HARBOR_VERIFIER_IDENTITY);
  });

  it('resolves a youtube channel id to the identity that claims it', async () => {
    const identities = await new Harbor().resolveIdentities({
      platform: 'youtube',
      accountId: CHANNEL_ID,
    });

    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the other platforms on that identity', async () => {
    const socials = await new Harbor().linkedSocials({
      platform: 'youtube',
      accountId: CHANNEL_ID,
    });

    // Asserting the shape rather than the exact accounts: the claims belong to someone who can
    // add or remove them. What must hold is that a lookup crosses platforms and stays verified.
    expect(socials.length).toBeGreaterThan(1);
    expect(new Set(socials.map((social) => social.platform)).size).toBeGreaterThan(1);

    for (const social of socials) {
      expect(social.verifiedBy).toContain(HARBOR_VERIFIER_IDENTITY);
    }
  });

  it('answers an account nobody has claimed with an empty result, not an error', async () => {
    const socials = await new Harbor().linkedSocials({
      platform: 'youtube',
      account: 'harbor-lookup-no-such-account-cafebabe',
    });

    expect(socials).toEqual([]);
  });

  it('honours an abort', async () => {
    const controller = new AbortController();
    const pending = new Harbor().resolveIdentities(
      { platform: 'youtube', accountId: CHANNEL_ID },
      { signal: controller.signal },
    );

    controller.abort();

    await expect(pending).rejects.toThrow();
  });
});
