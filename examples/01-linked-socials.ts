/**
 * One social account in, the accounts verifiably linked to it out.
 *
 *   npx tsx examples/01-linked-socials.ts youtube UC1-QO9dEJxK05SAEM02bxkQ
 *   npx tsx examples/01-linked-socials.ts twitch asphaltstorm96
 *
 * The second argument is matched as a channel id when it looks like one and as a handle
 * otherwise, which is the only reason this example needs to know anything about YouTube.
 */
import { Harbor, type SocialQuery } from '../src/index.js';

const [platform = 'youtube', account = 'UC1-QO9dEJxK05SAEM02bxkQ'] = process.argv.slice(2);

// A YouTube channel id is the platform's stable identifier; everything else is a handle.
const isChannelId = platform === 'youtube' && account.startsWith('UC') && account.length === 24;
const query: SocialQuery = isChannelId ? { platform, accountId: account } : { platform, account };

const harbor = new Harbor();
const socials = await harbor.linkedSocials(query);

if (socials.length === 0) {
  console.log(`No verified claims for ${platform} ${account}.`);
  console.log('Harbor is opt-in, so this is the usual answer for an account nobody has claimed.');
} else {
  console.log(`${String(socials.length)} verified account(s) on the same identity:\n`);

  for (const social of socials) {
    const id = social.accountId === undefined ? '' : ` (${social.accountId})`;
    console.log(`  ${social.platformName.padEnd(12)} ${social.account ?? '—'}${id}`);
    console.log(`  ${''.padEnd(12)} ${social.url ?? 'no url recorded'}`);
  }

  console.log(`\nClaimed by identity ${socials[0]?.identity ?? ''}`);
}
