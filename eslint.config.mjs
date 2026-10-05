// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Size limits come from the project's coding rules: ~400 lines soft, 600 hard for a source file,
 * 100 for a function. ESLint covers both natively, so there is no separate test for them.
 */
export default tseslint.config(
  {
    // `src/generated/` is not linted. It is `protoc-gen-ts` output: a hand-written-style
    // decoder per message, full of `let` that is never reassigned, `==`, bare `for` loops and
    // `any` at the serializer boundary — some 2500 findings, none of them anyone's to act on,
    // all of them rewritten by the next `npm run generate`. Linting it would mean either a
    // rule-by-rule exemption list that grows with every protobuf-ts release, or ignoring 2500
    // errors in the output everyone else has to read. The consuming code in `src/` is linted
    // in full, and that is where a mistake here would actually be made.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'proto/**', 'src/generated/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'max-lines': ['error', { max: 600, skipBlankLines: false, skipComments: false }],
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: false, skipComments: false }],
      'max-depth': ['error', 3],
      'max-params': ['error', 5],
      complexity: ['error', 15],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'prefer-const': 'error',

      // The rules the project's own conventions turn into hard errors rather than style notes.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Protobuf field names are snake_case and the generated types keep them, deliberately, so a
      // naming-convention rule would fight the schema at every field. The compiler checks shape.
      '@typescript-eslint/naming-convention': 'off',
    },
  },

  {
    // The examples and the tools are scripts: printing is the point, and a bare `console` is the
    // right output channel for them.
    files: ['examples/**', 'tools/**'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['**/*.test.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  { files: ['**/*.mjs'], ...tseslint.configs.disableTypeChecked },
);
