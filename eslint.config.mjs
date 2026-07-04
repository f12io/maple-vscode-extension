import eslintJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['out', '**/dist', '.vscode-test', '__mocks__']),
  {
    extends: [
      eslintJs.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: { direct: true },
        },
      ],
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowTernary: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '.*',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^ignore',
        },
      ],
      'no-useless-escape': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true },
      ],
    },
  },
  // Node Environment (Build, Scripts, Tests, Configs, Source)
  {
    files: [
      '**/*.{ts,js,mjs}',
    ],languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-restricted-exports': 'off',
    },
  },
  {
    files: [
      'eslint.config.mjs',
      'esbuild.mjs',
      'scripts/**/*.mjs',
      '__mocks__/**/*.js',
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
