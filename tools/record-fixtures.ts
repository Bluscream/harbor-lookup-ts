/**
 * Record real grpc-web responses into `test/fixtures/`, so the tests replay actual wire bytes
 * rather than a hand-built idea of them.
 *
 * A fixture built by hand only proves the decoder agrees with whoever wrote the fixture. These
 * are what `srv.harbor.social` actually sent, base64 as the grpc-web text format already is.
 *
 *   npx tsx tools/record-fixtures.ts
 *
 * The recorded accounts are public verified claims; re-run this when the schema changes upstream
 * and read the diff.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Harbor } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'test', 'fixtures');

/** The channel whose claims the fixtures capture: six verified accounts across three platforms. */
const CHANNEL_ID = 'UC1-QO9dEJxK05SAEM02bxkQ';

interface Recorded {
  method: string;
  body: string;
}

const recorded: Recorded[] = [];

const recordingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const body = await response.text();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  recorded.push({ method: url.slice(url.lastIndexOf('/') + 1), body });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

const harbor = new Harbor({ fetch: recordingFetch });
const socials = await harbor.linkedSocials({ platform: 'youtube', accountId: CHANNEL_ID });

console.log(`recorded ${String(recorded.length)} responses, ${String(socials.length)} socials`);

if (recorded.length < 2) {
  throw new Error('Expected a resolve and a list call; the lookup did not make both.');
}

await mkdir(fixtures, { recursive: true });

for (const { method, body } of recorded) {
  const path = join(fixtures, `${method}.grpcweb.txt`);

  await writeFile(path, body, 'utf8');
  console.log(`  ${method} → ${String(body.length)} bytes`);
}

await writeFile(
  join(fixtures, 'README.md'),
  [
    '# Fixtures',
    '',
    'Real grpc-web (text format) response bodies from `https://srv.harbor.social`, recorded by',
    '`tools/record-fixtures.ts`. The file name is the gRPC method that produced it.',
    '',
    `The subject is the public YouTube channel \`${CHANNEL_ID}\`, which carries six verified`,
    'platform claims. Re-record and read the diff when the schema moves upstream.',
    '',
  ].join('\n'),
  'utf8',
);
