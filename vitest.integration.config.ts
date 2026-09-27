import { defineConfig } from 'vitest/config';

// Runs the real oxlint CLI against the packed plugin, so it needs `npm run
// build` first and is kept apart from the unit suite and its coverage.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/globalSetup.ts'],
    testTimeout: 60_000,
  },
});
