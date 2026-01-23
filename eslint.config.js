import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unicorn from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tseslint from 'typescript-eslint'

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
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
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
      '@typescript-eslint/no-require-imports': 0,
      '@typescript-eslint/no-this-alias': 0,
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/no-array-constructor': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_|^err$|^e$',
        },
      ],
      'no-extra-parens': 0,
      '@typescript-eslint/no-extra-parens': 0,
      'import/namespace': 'off',
      'import/default': 'off',
      'import/named': 'off',
      'import/no-default-export': 'error',
      'import/extensions': ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'import/no-duplicates': 'off',
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
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
    rules: {
      'no-empty-function': 0,
      '@typescript-eslint/no-empty-function': 0,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '.*',
        },
      ],
    },
  },

  {
    files: ['types/**/*'],
    rules: {
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/no-explicit-any': 0,
    },
  },

  {
    files: ['.mocharc.js', 'babel-register.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        module: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'import/no-commonjs': 'off',
    },
  },

  {
    files: ['*.mjs', 'build.mjs'],
    rules: {
      'no-console': 'off',
    },
  },

  // ESLint flat config requires default export
  {
    files: ['eslint.config.js'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
]
