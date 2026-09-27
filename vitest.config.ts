import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
      // A lint rule is a pile of small branches — this receiver shape, that
      // argument count — and each one untested is a false positive or a broken
      // fix waiting for a user to find it. Full coverage keeps that honest.
      thresholds: { statements: 100, lines: 100, branches: 100, functions: 100 },
    },
  },
});
