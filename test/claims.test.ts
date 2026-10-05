/**
 * Field decoding, and what a bundle that is not a platform claim does.
 *
 * `harbor.test.ts` covers the happy path against recorded bytes. This covers the encodings
 * nothing currently publishes but the proto defines, which recorded bytes cannot reach.
 */
import { describe, expect, it } from 'vitest';

import { ContentDigestType } from '../src/generated/polycentric/v2/common.js';
import { Content, Post } from '../src/generated/polycentric/v2/content.js';
import { Event, type EventBundle } from '../src/generated/polycentric/v2/events.js';
import {
  FieldKind,
  VerificationSchema,
  type VerificationClaim,
} from '../src/generated/polycentric/v2/verifications.js';
import type { VerificationClaimBundle } from '../src/generated/polycentric/v2/verifications_service.js';
import { decodeClaimBundle, DecodeError } from '../src/index.js';

const IDENTITY = 'abc123';

/** A signed event naming `IDENTITY`, wrapping `content`. */
function bundleOf(content: Content | undefined): EventBundle {
  const event = Event.create({ key: { collection: 8, identity: IDENTITY, sequence: '1' } });

  return {
    signed_event: { signature: new Uint8Array(), event_bytes: Event.toBinary(event) },
    event_proofs: [],
    ...(content ? { serialized_content: { content_bytes: Content.toBinary(content) } } : {}),
  };
}

/** A claim bundle for a schema with one field of `kind`, holding `bytes`. */
function claimBundle(
  kind: FieldKind,
  bytes: Uint8Array,
  options: { key?: string; schemaKey?: string } = {},
): VerificationClaimBundle {
  const key = options.key ?? 'value';
  const schema = VerificationSchema.create({
    name: 'Platform',
    description: '',
    fields: [{ key: options.schemaKey ?? key, kind, format: '', required: true, description: '' }],
  });

  const claim: VerificationClaim = {
    schema: {
      schema_bytes: VerificationSchema.toBinary(schema),
      digest: { type: ContentDigestType.SHA256, value: new Uint8Array() },
    },
    fields: { [key]: bytes },
  };

  return {
    claim: bundleOf(
      Content.create({
        content_body: { oneofKind: 'verification_claim', verification_claim: claim },
      }),
    ),
    targets: [],
    verifies: [],
  };
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('field decoding', () => {
  it('reads a STRING field as UTF-8', () => {
    const claim = decodeClaimBundle(claimBundle(FieldKind.STRING, utf8('@someone')));

    expect(claim?.fields.value).toBe('@someone');
  });

  it('reads a non-ASCII STRING field', () => {
    const claim = decodeClaimBundle(claimBundle(FieldKind.STRING, utf8('Ünïcøde ✓')));

    expect(claim?.fields.value).toBe('Ünïcøde ✓');
  });

  it('rejects bytes a STRING field cannot hold', () => {
    // A lone continuation byte. Decoding it leniently would silently produce U+FFFD, and a claim
    // is hashed over exact bytes — a value that does not round-trip is not the claimed value.
    expect(() =>
      decodeClaimBundle(claimBundle(FieldKind.STRING, new Uint8Array([0x80]))),
    ).toThrow();
  });

  it('reads an INT field as a little-endian int64', () => {
    const bytes = new Uint8Array(8);

    new DataView(bytes.buffer).setBigInt64(0, -42n, true);

    expect(decodeClaimBundle(claimBundle(FieldKind.INT, bytes))?.fields.value).toBe('-42');
  });

  it('keeps an INT field exact past Number.MAX_SAFE_INTEGER', () => {
    const bytes = new Uint8Array(8);

    new DataView(bytes.buffer).setBigInt64(0, 9007199254740993n, true);

    expect(decodeClaimBundle(claimBundle(FieldKind.INT, bytes))?.fields.value).toBe(
      '9007199254740993',
    );
  });

  it('rejects an INT field of the wrong width', () => {
    expect(() => decodeClaimBundle(claimBundle(FieldKind.INT, new Uint8Array(4)))).toThrow(
      DecodeError,
    );
  });

  it('reads a BOOL field', () => {
    expect(decodeClaimBundle(claimBundle(FieldKind.BOOL, new Uint8Array([1])))?.fields.value).toBe(
      'true',
    );
    expect(decodeClaimBundle(claimBundle(FieldKind.BOOL, new Uint8Array([0])))?.fields.value).toBe(
      'false',
    );
  });

  it('rejects a BOOL field that is not canonically 0 or 1', () => {
    expect(() => decodeClaimBundle(claimBundle(FieldKind.BOOL, new Uint8Array([2])))).toThrow(
      DecodeError,
    );
  });

  it('reads a BYTES field as hex', () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xff]);

    expect(decodeClaimBundle(claimBundle(FieldKind.BYTES, bytes))?.fields.value).toBe('000fff');
  });

  it('refuses a field whose schema declares no kind', () => {
    expect(() => decodeClaimBundle(claimBundle(FieldKind.UNSPECIFIED, utf8('x')))).toThrow(
      DecodeError,
    );
  });

  it('drops a field the schema does not define rather than guessing its encoding', () => {
    // The kind is what says how to read the bytes. Assuming UTF-8 would turn an INT into mojibake
    // that reads like a real value.
    const claim = decodeClaimBundle(
      claimBundle(FieldKind.STRING, utf8('x'), { key: 'unlisted', schemaKey: 'listed' }),
    );

    expect(claim?.fields).toEqual({});
  });
});

describe('a bundle that is not a claim', () => {
  it('is skipped, because a response may legitimately carry other content', () => {
    const bundle: VerificationClaimBundle = {
      claim: bundleOf(
        Content.create({
          content_body: { oneofKind: 'post', post: Post.create({ text: 'hi' }) },
        }),
      ),
      targets: [],
      verifies: [],
    };

    expect(decodeClaimBundle(bundle)).toBeUndefined();
  });

  it('is skipped when it carries no content at all', () => {
    expect(
      decodeClaimBundle({ claim: bundleOf(undefined), targets: [], verifies: [] }),
    ).toBeUndefined();
  });

  it('is skipped when there is no claim event', () => {
    expect(decodeClaimBundle({ targets: [], verifies: [] })).toBeUndefined();
  });
});

describe('a claim that cannot be read', () => {
  it('throws rather than reporting an empty result, because that is a protocol mismatch', () => {
    const claim: VerificationClaim = { fields: { value: utf8('x') } };
    const bundle: VerificationClaimBundle = {
      claim: bundleOf(
        Content.create({
          content_body: { oneofKind: 'verification_claim', verification_claim: claim },
        }),
      ),
      targets: [],
      verifies: [],
    };

    expect(() => decodeClaimBundle(bundle)).toThrow(DecodeError);
  });
});
