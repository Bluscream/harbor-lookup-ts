import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The live suite has its own config and its own npm script; it talks to srv.harbor.social.
    exclude: ['test/live/**'],
    coverage: {
      provider: 'v8',
      // Generated protobuf code is upstream's; covering it would measure protoc-gen-ts.
      exclude: ['src/generated/**', 'tools/**', 'examples/**', 'dist/**', '*.config.ts'],
    },
  },
});
