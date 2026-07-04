import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      vscode: path.resolve(__dirname, '__mocks__/vscode.ts'),
      // Test against workspace sources so no build step is needed
      '@f12io/maple-language-core': path.resolve(
        __dirname,
        'packages/core/src/index.ts',
      ),
      '@f12io/prettier-plugin-maple': path.resolve(
        __dirname,
        'packages/prettier-plugin/src/index.ts',
      ),
    },
    exclude: ['out/**', 'node_modules/**', '**/dist/**'],
  },
});
