import { describe, expect, it } from 'vitest';

import {
  Harbor,
  HARBOR_VERIFIER_IDENTITY,
  QueryError,
  RpcError,
  TransportError,
} from '../src/index.js';
import { constantFetch, replayFetch } from './replay.js';

/** The channel the fixtures were recorded for, and the identity that claims it. */
const CHANNEL_ID = 'UC1-QO9dEJxK05SAEM02bxkQ';
const IDENTITY = '9fc9859f426c56fa3319a5566cf1541596783c4847efc1a19859c201fbd31519';

const query = { platform: 'youtube', accountId: CHANNEL_ID } as const;

describe('a lookup', () => {
  it('turns one channel id into every account the same identity claims', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });
    const socials = await harbor.linkedSocials(query);

    expect(
      socials
        .map((social) => `${social.platform}:${social.account ?? ''}`)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual([
      'twitch:asphaltstorm96',
      'twitch:shadowstorm0896',
      'x:asphaltstorm96',
      'x:shadowstorm_96',
      'youtube:@asphaltstorm96',
      'youtube:@shadowstorm_96',
    ]);
  });

  it('reads the second youtube channel id, which is the point of the whole exercise', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });
    const socials = await harbor.linkedSocials(query);

    const ids = socials.filter((social) => social.platform === 'youtube').map((s) => s.accountId);

    expect(ids).toContain(CHANNEL_ID);
    expect(ids).toContain('UCMA8qCG7dJ6OVkF9XbCcmLg');
  });

  it('carries the url the claim recorded rather than building one', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });
    const socials = await harbor.linkedSocials(query);
    const x = socials.find(
      (social) => social.platform === 'x' && social.account === 'shadowstorm_96',
    );

    expect(x?.url).toBe('https://x.com/shadowstorm_96');
    // X claims record no platform id, so this stays undefined instead of repeating the handle.
    expect(x?.accountId).toBeUndefined();
  });

  it('names the platform the way Harbor does', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });
    const socials = await harbor.linkedSocials(query);

    expect(new Set(socials.map((social) => social.platformName))).toEqual(
      new Set(['YouTube', 'Twitch', 'X']),
    );
  });

  it('reports who verified each claim', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });
    const socials = await harbor.linkedSocials(query);

    for (const social of socials) {
      expect(social.verifiedBy).toEqual([HARBOR_VERIFIER_IDENTITY]);
    }
  });

  it('makes exactly two calls: resolve, then list', async () => {
    const calls: string[] = [];
    const harbor = new Harbor({ fetch: replayFetch({ onRequest: (m) => calls.push(m) }) });

    await harbor.linkedSocials(query);

    expect(calls).toEqual(['ResolveVerifiedClaims', 'ListVerificationClaims']);
  });

  it('keeps the grouping by identity when asked', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });
    const groups = await harbor.linkedIdentities(query);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.identity).toBe(IDENTITY);
    expect(groups[0]?.socials).toHaveLength(6);
  });

  it('resolves the identity on its own without listing anything', async () => {
    const calls: string[] = [];
    const harbor = new Harbor({ fetch: replayFetch({ onRequest: (m) => calls.push(m) }) });

    await expect(harbor.resolveIdentities(query)).resolves.toEqual([IDENTITY]);
    expect(calls).toEqual(['ResolveVerifiedClaims']);
  });
});

describe('the verifier filter', () => {
  it('drops every claim when the configured verifier vouched for none of them', async () => {
    // `ListVerificationClaims` takes no verifier argument, so this is the only thing standing
    // between a caller and an identity's self-asserted claims. The fixture is the same bytes
    // either way; what changes is whose signature counts.
    const harbor = new Harbor({
      fetch: replayFetch(),
      verifiers: ['0000000000000000000000000000000000000000000000000000000000000000'],
    });

    await expect(harbor.socialsOf(IDENTITY)).resolves.toEqual([]);
  });

  it('refuses to be constructed without a trust root', () => {
    expect(() => new Harbor({ verifiers: [] })).toThrow(QueryError);
  });

  it('refuses to be constructed without a server', () => {
    expect(() => new Harbor({ servers: [] })).toThrow(QueryError);
  });
});

describe('a bad query', () => {
  it('refuses an empty one rather than matching every verified claim there is', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });

    await expect(harbor.linkedSocials({})).rejects.toThrow(QueryError);
  });

  it('refuses an empty identity', async () => {
    const harbor = new Harbor({ fetch: replayFetch() });

    await expect(harbor.socialsOf('')).rejects.toThrow(QueryError);
  });
});

describe('failure', () => {
  it('moves to the next server when the first cannot be reached', async () => {
    const seen: string[] = [];
    const harbor = new Harbor({
      servers: ['https://down.example', 'https://srv.harbor.social'],
      fetch: replayFetch({
        failWith: (_method, url) =>
          url.startsWith('https://down.example') ? new TypeError('fetch failed') : undefined,
        onRequest: () => seen.push('call'),
      }),
    });

    await expect(harbor.resolveIdentities(query)).resolves.toEqual([IDENTITY]);
    expect(seen).toHaveLength(2);
  });

  it('reports the last server tried when none of them answered', async () => {
    const harbor = new Harbor({
      servers: ['https://a.example', 'https://b.example'],
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });

    // The transport turns the dead `fetch` into a gRPC `INTERNAL`, so the error that comes out
    // is an `RpcError` — but it names the last server, which is what says every one was tried.
    await expect(harbor.resolveIdentities(query)).rejects.toThrow('https://b.example');
  });

  it('keeps trying servers while the status says the server could not serve it', async () => {
    const tried: string[] = [];
    const harbor = new Harbor({
      servers: ['https://a.example', 'https://b.example', 'https://srv.harbor.social'],
      fetch: replayFetch({
        failWith: (_method, url) =>
          url.startsWith('https://srv.harbor.social') ? undefined : new TypeError('fetch failed'),
        onRequest: () => tried.push('call'),
      }),
    });

    await expect(harbor.resolveIdentities(query)).resolves.toEqual([IDENTITY]);
    expect(tried).toHaveLength(3);
  });

  it('does not retry another server on a gRPC status, because the answer would be the same', async () => {
    let calls = 0;
    const harbor = new Harbor({
      servers: ['https://a.example', 'https://b.example'],
      fetch: () => {
        calls += 1;

        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: {
              'content-type': 'application/grpc-web-text+proto',
              'grpc-status': '3',
              'grpc-message': 'bad request',
            },
          }),
        );
      },
    });

    await expect(harbor.resolveIdentities(query)).rejects.toThrow(RpcError);
    expect(calls).toBe(1);
  });

  it('surfaces an abort rather than treating it as a dead server', async () => {
    const controller = new AbortController();
    const harbor = new Harbor({
      servers: ['https://a.example', 'https://b.example'],
      fetch: () => Promise.reject(new DOMException('Aborted', 'AbortError')),
    });

    controller.abort();

    await expect(
      harbor.resolveIdentities(query, { signal: controller.signal }),
    ).rejects.not.toBeInstanceOf(TransportError);
  });

  it('returns nothing for an empty response instead of inventing a link', async () => {
    // A single empty grpc-web frame plus the trailer saying OK: a well-formed "no matches".
    const harbor = new Harbor({ fetch: constantFetch(fixtureEmptyOk()) });

    await expect(harbor.resolveIdentities(query)).resolves.toEqual([]);
  });
});

/**
 * An empty grpc-web text response: a zero-length data frame followed by a trailer frame carrying
 * `grpc-status: 0`. Built here rather than recorded because a miss is the one case the fixtures
 * cannot capture — the recorded channel is deliberately one that exists.
 */
function fixtureEmptyOk(): string {
  const data = [0x00, 0x00, 0x00, 0x00, 0x00];
  const trailer = new TextEncoder().encode('grpc-status:0\r\n');
  const header = [0x80, 0x00, 0x00, 0x00, trailer.length];

  return Buffer.from([...data, ...header, ...trailer]).toString('base64');
}
