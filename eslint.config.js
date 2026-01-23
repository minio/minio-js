import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import importPlugin from 'eslint-plugin-import'
import unicorn from 'eslint-plugin-unicorn'

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['examples/**/*', 'dist/**/*'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      import: importPlugin,
      unicorn,
    },
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts'],
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: false,
          extensionAlias: { '.js': ['.js'] },
          extensions: ['.ts', '.js', '.mjs'],
          fullySpecified: true,
          enforceExtension: true,
        },
      },
    },
    rules: {
      'no-console': 'error',
      'comma-dangle': 0,
      curly: 'error',
      'prefer-const': 0,
      'no-template-curly-in-string': 'error',
      'comma-spacing': 0,
      'semi-spacing': 0,
      'space-before-blocks': 0,
      'switch-colon-spacing': ['warn', { after: true, before: false }],
      'keyword-spacing': 0,
      'template-curly-spacing': 0,
      'rest-spread-spacing': 0,
      'no-multi-spaces': 0,
      'unicorn/prefer-node-protocol': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      indent: 'off',
      'linebreak-style': ['error', 'unix'],
      semi: ['error', 'never'],
      'spaced-comment': [
        'error',
        'always',
        {
          line: { markers: ['/'], exceptions: ['-', '+'] },
          block: { markers: ['!'], exceptions: ['*'], balanced: true },
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/prefer-optional-chain': 0,
      'no-empty-function': 0,
      '@typescript-eslint/no-empty-function': 0,
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/no-this-alias': 0,
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/no-array-constructor': 'off',
      'no-extra-parens': 0,
      '@typescript-eslint/no-extra-parens': 0,
      'import/namespace': 'error',
      'import/default': 'error',
      'import/named': 'error',
      'import/no-default-export': 'error',
      'import/extensions': ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'import/no-duplicates': 'error',
      'unused-imports/no-unused-imports': 'error',
      'import/no-amd': 'error',
    },
  },

  {
    files: ['src/**/*', 'tests/**/*'],
    rules: { 'import/no-commonjs': 'error' },
  },

  {
    files: ['src/**/*.ts'],
    rules: { 'prefer-const': ['error', { destructuring: 'all' }] },
  },

  {
    files: ['tests/**/*'],
    rules: {
      'no-empty-function': 0,
      '@typescript-eslint/no-empty-function': 0,
    },
  },

  {
    files: ['types/**/*'],
    rules: {
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/no-explicit-any': 0,
    },
  },
]
