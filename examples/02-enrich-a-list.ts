/**
 * Enrich a list of channels, which is the shape the real use case usually takes.
 *
 *   npx tsx examples/02-enrich-a-list.ts
 *
 * Note what this example is mostly demonstrating: misses. Harbor is opt-in, so a list of
 * arbitrary channels comes back almost entirely empty, and code built on this has to treat that
 * as the normal path rather than an error.
 */
import { Harbor, type Social } from '../src/index.js';

const CHANNELS = [
  'UC1-QO9dEJxK05SAEM02bxkQ',
  'UCXuqSBlHAE6Xw-yeJA0Tunw', // Linus Tech Tips
  'UCBJycsmduvYEL83R_U4JriQ', // MKBHD
];

const harbor = new Harbor();

// Independent lookups, so they go out together rather than one round trip at a time.
const results = await Promise.all(
  CHANNELS.map(async (accountId) => ({
    accountId,
    socials: await harbor.linkedSocials({ platform: 'youtube', accountId }),
  })),
);

for (const { accountId, socials } of results) {
  const others = socials.filter((social: Social) => social.accountId !== accountId);

  if (others.length === 0) {
    console.log(`${accountId}  —  nothing claimed`);
    continue;
  }

  const summary = others
    .map((social) => `${social.platformName}:${social.account ?? social.url ?? '?'}`)
    .join(', ');

  console.log(`${accountId}  —  ${summary}`);
}
