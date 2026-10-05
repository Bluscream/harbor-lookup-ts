import { describe, expect, it } from 'vitest';

import { isKnownPlatform, PLATFORM_NAMES, PLATFORM_SLUGS } from '../src/index.js';
import { queryFields, toSocial } from '../src/social.js';

describe('a query', () => {
  it('flattens the shorthands into the claim field keys the wire uses', () => {
    expect(queryFields({ platform: 'youtube', account: '@x', accountId: 'UC1' })).toEqual({
      platform: 'youtube',
      account: '@x',
      account_id: 'UC1',
    });
  });

  it('omits what was not given, so an absent field is not a filter on the empty string', () => {
    expect(queryFields({ platform: 'twitch' })).toEqual({ platform: 'twitch' });
  });

  it('carries arbitrary extra fields, because the schema is the claimant’s to define', () => {
    expect(queryFields({ platform: 'website', fields: { url: 'https://example.com' } })).toEqual({
      platform: 'website',
      url: 'https://example.com',
    });
  });

  it('lets a shorthand win over the same key in `fields`, so the named property is not silently ignored', () => {
    expect(queryFields({ platform: 'youtube', fields: { platform: 'twitch' } })).toEqual({
      platform: 'youtube',
    });
  });
});

describe('a social', () => {
  it('names the platform when Harbor has a name for the slug', () => {
    const social = toSocial('id', { platform: 'hacker-news', account: 'someone' }, ['v']);

    expect(social.platformName).toBe('Hacker News');
    expect(social.account).toBe('someone');
  });

  it('falls back to the slug for a platform added after this release', () => {
    const social = toSocial('id', { platform: 'some-new-site' }, ['v']);

    expect(social.platformName).toBe('some-new-site');
  });

  it('keeps every field, including ones it does not model', () => {
    const social = toSocial('id', { platform: 'website', proof_url: 'https://e.example/p' }, ['v']);

    expect(social.fields.proof_url).toBe('https://e.example/p');
    expect(social.account).toBeUndefined();
  });
});

describe('the platform table', () => {
  it('has a display name for every slug it lists', () => {
    // The two are separate declarations mirroring one upstream table, so a slug added to one and
    // not the other would otherwise surface as a social whose name is its slug.
    for (const slug of PLATFORM_SLUGS) {
      expect(PLATFORM_NAMES[slug], slug).toBeTypeOf('string');
    }

    expect(Object.keys(PLATFORM_NAMES).sort((a, b) => a.localeCompare(b))).toEqual(
      [...PLATFORM_SLUGS].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('recognises a known slug and not an unknown one', () => {
    expect(isKnownPlatform('youtube')).toBe(true);
    expect(isKnownPlatform('myspace')).toBe(false);
  });
});
