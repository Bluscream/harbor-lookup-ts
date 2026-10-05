import { defineConfig } from 'vitest/config';

/**
 * The live suite, run by `npm run test:live`. Kept out of the default run on purpose: a skipped
 * test reports green, and a test that needs the network would skip on every machine without it.
 * Separating them means the default gate has no skips at all and this one has no excuses.
 */
export default defineConfig({
  test: {
    include: ['test/live/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
