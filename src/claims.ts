/**
 * Reading a `VerificationClaimBundle` off the wire.
 *
 * A bundle does not hand you a claim. It hands you a signed event whose body is a separate
 * serialized `Content` message, and the claim carries its own schema inline as another
 * serialized message, because the schema's digest has to be taken over exact bytes. So getting
 * from a response to "youtube, @someone" is three nested decodes, and this module is all of them.
 */
import { Content } from './generated/polycentric/v2/content.js';
import { Event, type EventBundle } from './generated/polycentric/v2/events.js';
import {
  FieldKind,
  VerificationSchema,
  type VerificationClaim,
} from './generated/polycentric/v2/verifications.js';
import type { VerificationClaimBundle } from './generated/polycentric/v2/verifications_service.js';
import { DecodeError } from './errors.js';

/** A claim, flattened into the identity that made it and the fields it carries. */
export interface DecodedClaim {
  /** The identity the claim event belongs to. */
  readonly identity: string;
  /** `VerificationSchema.name` — `Platform` for every platform claim Harbor issues. */
  readonly schemaName: string;
  /** The claim's fields, decoded per the schema's `FieldKind` for each key. */
  readonly fields: Readonly<Record<string, string>>;
  /** Identities that published a `VerificationVerify` event for this claim. */
  readonly verifiedBy: readonly string[];
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Decode one field's canonical bytes.
 *
 * The encoding per kind is fixed by the proto's own comment, because claims are hashed and a
 * non-canonical encoding would not round-trip to the same digest: STRING is UTF-8, INT is a
 * little-endian int64, BOOL is `0x00`/`0x01`, BYTES is verbatim.
 *
 * Everything comes back as a string. Only STRING fields exist in practice — Harbor's own
 * `encodeFieldValue` throws on the rest — so giving the other kinds a `string | number | boolean`
 * union would complicate every consumer for values nothing currently publishes. INT becomes its
 * decimal form and BYTES its hex, both lossless.
 */
function decodeField(kind: FieldKind, bytes: Uint8Array): string {
  switch (kind) {
    case FieldKind.STRING:
      return utf8.decode(bytes);

    case FieldKind.INT: {
      if (bytes.length !== 8) {
        throw new DecodeError(`An INT field is ${String(bytes.length)} bytes rather than 8.`);
      }

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      return view.getBigInt64(0, true).toString();
    }

    case FieldKind.BOOL: {
      if (bytes.length !== 1 || (bytes[0] !== 0 && bytes[0] !== 1)) {
        throw new DecodeError('A BOOL field is not a single 0x00 or 0x01 byte.');
      }

      return bytes[0] === 1 ? 'true' : 'false';
    }

    case FieldKind.BYTES:
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

    case FieldKind.UNSPECIFIED:
      throw new DecodeError('A field declares no kind, so its bytes cannot be read.');
  }
}

/** Read the schema a claim carries inline, and the kind it declares for each field key. */
function schemaOf(claim: VerificationClaim): { name: string; kinds: Map<string, FieldKind> } {
  const bytes = claim.schema?.schema_bytes;

  if (bytes === undefined) {
    throw new DecodeError('A claim carries no schema, so its fields cannot be decoded.');
  }

  const schema = VerificationSchema.fromBinary(bytes);
  const kinds = new Map<string, FieldKind>();

  for (const field of schema.fields) {
    kinds.set(field.key, field.kind);
  }

  return { name: schema.name, kinds };
}

/** The identity an event belongs to, from the signed `Event` inside its bundle. */
function identityOf(bundle: EventBundle): string {
  const bytes = bundle.signed_event?.event_bytes;

  if (bytes === undefined) {
    throw new DecodeError('An event bundle carries no signed event.');
  }

  const identity = Event.fromBinary(bytes).key?.identity;

  if (identity === undefined || identity === '') {
    throw new DecodeError('A signed event names no identity.');
  }

  return identity;
}

/** The `Content` body an event bundle carries, or `undefined` when it carries none. */
function contentOf(bundle: EventBundle): Content | undefined {
  const bytes = bundle.serialized_content?.content_bytes;

  return bytes === undefined ? undefined : Content.fromBinary(bytes);
}

/**
 * Decode a bundle into a claim.
 *
 * Returns `undefined` rather than throwing when the bundle holds something that is not a
 * verification claim: a response may legitimately carry other content, and skipping it is not an
 * error. A bundle that *is* a claim but cannot be read throws, because that is a protocol
 * mismatch and silently dropping it would turn a broken decode into an empty result.
 */
export function decodeClaimBundle(bundle: VerificationClaimBundle): DecodedClaim | undefined {
  const claimEvent = bundle.claim;

  if (claimEvent === undefined) return undefined;

  const content = contentOf(claimEvent);

  if (content?.content_body.oneofKind !== 'verification_claim') return undefined;

  const claim = content.content_body.verification_claim;
  const { name, kinds } = schemaOf(claim);
  const fields: Record<string, string> = {};

  for (const [key, bytes] of Object.entries(claim.fields)) {
    // A key with no FieldDef is not decodable: the kind is what says how to read the bytes.
    // Treating it as a string would guess, and a wrong guess reads as real data.
    const kind = kinds.get(key);

    if (kind !== undefined) {
      fields[key] = decodeField(kind, bytes);
    }
  }

  return {
    identity: identityOf(claimEvent),
    schemaName: name,
    fields,
    verifiedBy: verifierIdentities(bundle),
  };
}

/** The identities that authored the `VerificationVerify` events in a bundle. */
function verifierIdentities(bundle: VerificationClaimBundle): string[] {
  const identities = new Set<string>();

  for (const verify of bundle.verifies) {
    if (contentOf(verify)?.content_body.oneofKind === 'verification_verify') {
      identities.add(identityOf(verify));
    }
  }

  return [...identities];
}
