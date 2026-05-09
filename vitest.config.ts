import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'adapters/*/src/**/*.test.ts',
    ],
    // OSS contributor onboarding: clean clone + npm install + npm test must
    // be green even before any test files exist (PROJECT_PLAN H — self-test
    // discipline). When tests land, this flag becomes a no-op.
    passWithNoTests: true,
  },
});
