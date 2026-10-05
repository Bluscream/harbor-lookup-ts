/** The error types this package throws. */

/** Base class, so a consumer can catch everything from here with one `instanceof`. */
export class HarborError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A request never produced a usable response: the network, TLS, CORS, or a non-gRPC reply. */
export class TransportError extends HarborError {
  constructor(
    message: string,
    readonly server: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** The server answered, with a gRPC status that is not `OK`. */
export class RpcError extends HarborError {
  constructor(
    message: string,
    readonly code: string,
    readonly server: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * A response arrived but could not be read as the claim it should contain.
 *
 * Separate from `RpcError` because it means something different: the call succeeded and the
 * payload is not what the schema says it is, which is a bug or a protocol change rather than a
 * failed lookup. A claim that simply does not exist is an empty result, not this.
 */
export class DecodeError extends HarborError {}

/** The arguments could not describe a lookup — an empty query, or no trust root to verify against. */
export class QueryError extends HarborError {}
