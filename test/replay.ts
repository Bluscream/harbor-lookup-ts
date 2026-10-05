/**
 * A `fetch` that answers from the recorded fixtures instead of the network.
 *
 * The fixtures are real grpc-web text frames (see `test/fixtures/README.md`), so a test using
 * this exercises the actual decoder against actual server output — the only part that is faked
 * is the transport.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** The gRPC method a grpc-web request url addresses. */
export function methodOf(input: Parameters<typeof fetch>[0]): string {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  return url.slice(url.lastIndexOf('/') + 1);
}

/** The recorded body for one method. */
export function fixture(method: string): string {
  return readFileSync(join(fixtures, `${method}.grpcweb.txt`), 'utf8');
}

/** Headers a grpc-web text response carries. The transport needs the content type to parse. */
function grpcWebHeaders(): HeadersInit {
  return { 'content-type': 'application/grpc-web-text+proto' };
}

/** Options for a replaying `fetch`. */
export interface ReplayOptions {
  /** Called with each method requested, in order. */
  readonly onRequest?: (method: string) => void;
  /** Methods to fail with a network error instead of answering, to exercise server failover. */
  readonly failWith?: (method: string, url: string) => Error | undefined;
}

/** Build a `fetch` that replays the fixtures. */
export function replayFetch(options: ReplayOptions = {}): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = methodOf(input);

    options.onRequest?.(method);

    const failure = options.failWith?.(method, url);

    if (failure) return Promise.reject(failure);

    if (init?.signal?.aborted === true) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }

    return Promise.resolve(new Response(fixture(method), { headers: grpcWebHeaders() }));
  };
}

/** A `fetch` that answers every call with one body — for an empty or malformed response. */
export function constantFetch(body: string, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(body, { status, headers: grpcWebHeaders() }));
}
