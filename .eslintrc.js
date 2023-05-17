module.exports = {
  env: {
    node: true,
    mocha: true,
    es6: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier', // This should be the last entry.
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'simple-import-sort', 'unused-imports', 'import', 'unicorn'],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest',
  },
  ignorePatterns: ['examples/**/*', 'dist/**/*'],
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts'],
    },
    // we need to config this so import are fully specified
    // otherwise @babel/register can't handle TypeScript files
    'import/resolver': {
      typescript: {
        alwaysTryTypes: false,
        extensionAlias: {
          '.js': ['.js'],
        },
        extensions: ['.ts', '.js', '.mjs'],
        fullySpecified: true,
        enforceExtension: true,
      },
    },
  },
  rules: {
    'no-console': ['error'],
    // "no-var": ["error"],
    'comma-dangle': 0,
    curly: ['error'],
    'prefer-const': 0,
    'no-template-curly-in-string': 'error',
    // "quotes": ["error", "double"],
    'comma-spacing': 0, // ["error", { before: false, after: true }],
    'semi-spacing': 0, // ["warn", { before: false, after: true }],
    'space-before-blocks': 0, // ["warn", "always"],
    'switch-colon-spacing': ['warn', { after: true, before: false }],
    'keyword-spacing': 0, // ["warn", { before: true, after: true }],
    'template-curly-spacing': 0, // ["error", "never"],
    'rest-spread-spacing': 0, // ["error", "never"],
    'no-multi-spaces': 0, // ["warn", { ignoreEOLComments: false }],

    // import node stdlib as `node:...`
    // don't worry, babel will remove these prefix.
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
        line: {
          markers: ['/'],
          exceptions: ['-', '+'],
        },
        block: {
          markers: ['!'],
          exceptions: ['*'],
          balanced: true,
        },
      },
    ],
    '@typescript-eslint/no-explicit-any': ['warn'],

    '@typescript-eslint/prefer-optional-chain': 0, // ["warn"],
    'no-empty-function': 0,
    '@typescript-eslint/no-empty-function': 0, // ["warn"],
    '@typescript-eslint/no-var-requires': 0,
    '@typescript-eslint/no-this-alias': 0,
    '@typescript-eslint/no-empty-interface': ['warn'],

    '@typescript-eslint/no-array-constructor': ['off'],

    'no-extra-parens': 0,
    '@typescript-eslint/no-extra-parens': 0,
    'import/namespace': 'error',
    'import/default': 'error',
    'import/named': 'error',
    // default export confuse esm/cjs interop
    'import/no-default-export': 'error',
    'import/extensions': ['error', 'always'],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      },
    ],
    'unused-imports/no-unused-imports': 'error',
    'import/no-amd': 'error',
  },
  overrides: [
    {
      files: ['./src/**/*', './tests/**/*'],
      rules: {
        'import/no-commonjs': 'error',
      },
    },
    {
      files: ['./src/**/*.ts'],
      rules: {
        'prefer-const': 'error',
      },
    },
    {
      files: ['./tests/**/*'],
      rules: {
        'no-empty-function': 0,
        '@typescript-eslint/no-empty-function': 0,
      },
    },
    {
      files: ['./types/**/*'],
      rules: {
        '@typescript-eslint/no-unused-vars': 0,
        '@typescript-eslint/no-explicit-any': 0,
      },
    },
  ],
}
