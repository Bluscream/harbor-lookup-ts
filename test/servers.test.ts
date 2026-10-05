import { describe, expect, it } from 'vitest';

import {
  fetchVerifierIdentity,
  HARBOR_SEED_SERVERS,
  HARBOR_VERIFIER_IDENTITY,
  HARBOR_VERIFIER_SERVER,
} from '../src/index.js';

const json =
  (body: unknown, status = 200): typeof fetch =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );

describe('the published constants', () => {
  it('are the values Harbor serves, in the shape the transport needs', () => {
    expect(HARBOR_SEED_SERVERS).toEqual([
      'https://srv.harbor.social',
      'https://srv.polycentric.io',
    ]);

    // The grpc-web transport appends `/<package>.<service>/<method>` to the base url, so a
    // trailing slash here would produce a double slash in every request path.
    for (const server of HARBOR_SEED_SERVERS) {
      expect(server.endsWith('/')).toBe(false);
    }
  });

  it('pin a 32-byte verifier identity', () => {
    expect(HARBOR_VERIFIER_IDENTITY).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('fetchVerifierIdentity', () => {
  it('reads the identity the verifier publishes', async () => {
    await expect(
      fetchVerifierIdentity(HARBOR_VERIFIER_SERVER, { fetch: json({ identity: 'abc' }) }),
    ).resolves.toBe('abc');
  });

  it('refuses a response that carries no identity, rather than returning an empty trust root', async () => {
    await expect(
      fetchVerifierIdentity(HARBOR_VERIFIER_SERVER, { fetch: json({}) }),
    ).rejects.toThrow('did not return an identity');

    await expect(
      fetchVerifierIdentity(HARBOR_VERIFIER_SERVER, { fetch: json({ identity: '' }) }),
    ).rejects.toThrow('did not return an identity');
  });

  it('reports a failed request', async () => {
    await expect(
      fetchVerifierIdentity(HARBOR_VERIFIER_SERVER, { fetch: json({}, 503) }),
    ).rejects.toThrow('503');
  });
});
