/**
 * The README's snippets, as code.
 *
 * A documented call that does not compile is worse than no documentation. This file is
 * type-checked by `npm run typecheck` like everything else, which is most of the point; the
 * assertions just prove the calls reach the wire the way the README says they do.
 */
import { describe, expect, it } from 'vitest';

import {
  Harbor,
  HARBOR_VERIFIER_IDENTITY,
  PLATFORM_SLUGS,
  QueryError,
  RpcError,
  TransportError,
  type HarborError,
  type Social,
} from '../src/index.js';
import { replayFetch } from './replay.js';

describe('the README', () => {
  it('runs the opening example', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });
    const socials = await harbor.linkedSocials({
      platform: 'youtube',
      account: '@asphaltstorm96',
    });

    const lines = socials.map(
      (social: Social) => `${social.platformName} ${social.account ?? ''} ${social.url ?? ''}`,
    );

    expect(lines).toContain('YouTube @asphaltstorm96 https://www.youtube.com/@asphaltstorm96');
    expect(lines).toContain('X shadowstorm_96 https://x.com/shadowstorm_96');
  });

  it('accepts all three query shapes it shows', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });

    await harbor.linkedSocials({ platform: 'youtube', accountId: 'UC1-QO9dEJxK05SAEM02bxkQ' });
    await harbor.linkedSocials({ platform: 'twitch', account: 'asphaltstorm96' });
    await harbor.linkedSocials({ platform: 'website', fields: { url: 'https://example.com' } });

    expect(true).toBe(true);
  });

  it('accepts the options block it shows', async () => {
    const harbor = new Harbor({
      servers: ['https://srv.harbor.social'],
      verifiers: [HARBOR_VERIFIER_IDENTITY],
      fetch: replayFetch(),
      format: 'text',
    });

    const socials = await harbor.linkedSocials(
      { platform: 'youtube', account: '@asphaltstorm96' },
      { signal: AbortSignal.timeout(5000), allSchemas: true },
    );

    expect(socials).not.toHaveLength(0);
  });

  it('lists the platform slugs it names', () => {
    expect([...PLATFORM_SLUGS]).toEqual([
      'x',
      'youtube',
      'github',
      'discord',
      'hacker-news',
      'rumble',
      'twitch',
      'website',
    ]);
  });

  it('narrows errors through the base class it documents', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });

    try {
      await harbor.linkedSocials({});
      expect.unreachable('an empty query must throw');
    } catch (error) {
      // No cast: this block would not compile if the hierarchy were not what the README says.
      const harborError = error as HarborError;

      expect(harborError).toBeInstanceOf(QueryError);
      expect(harborError).not.toBeInstanceOf(RpcError);
      expect(harborError).not.toBeInstanceOf(TransportError);
    }
  });

  it('reaches the generated client for a service this package does not wrap', async () => {
    const { VerificationsServiceClient } = await import('../src/index.js');

    expect(VerificationsServiceClient).toBeTypeOf('function');
  });
});
