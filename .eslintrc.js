module.exports = {
  'env': {
    'node': true,
    'mocha': true,
    'es6': true
  },
  'extends': ['eslint:recommended',
              'plugin:@typescript-eslint/recommended'
  ],
  'parser': '@typescript-eslint/parser',
  'plugins': ['@typescript-eslint'],
  'parserOptions': {
    'sourceType': 'module',
    'ecmaVersion': 8
  },
  'rules': {
    'no-console': ['error'],
    'no-var': ['error'],
    'no-empty-function': ['error'],
    'comma-dangle': ['error', 'never'],
    'prefer-const': ['error'],
    'quotes': ['error', 'single'],
    'comma-spacing': ['error', { before: false, after: true }],
    'semi-spacing': ['warn', { before: false, after: true }],
    'space-before-blocks': ['warn', 'always'],
    'switch-colon-spacing': ['warn', { after: true, before: false }],
    'keyword-spacing': ['warn', { before: true, after: true }],
    'template-curly-spacing': ['error', 'never'],
    'rest-spread-spacing': ['error', 'never'],
    'no-multi-spaces': ['warn', { ignoreEOLComments: false }],

    'indent': [
      'error',
      2,
      {
        'FunctionDeclaration': { 'parameters': 'first' },
        'FunctionExpression': { 'parameters': 'first' },
        'CallExpression': { 'arguments': 'first' },
        'ArrayExpression': 'first',
        'ObjectExpression': 'first'
      }
    ],
    'linebreak-style': [
      'error',
      'unix'
    ],
    'semi': ['error', 'never'],
    'spaced-comment': ['error', 'always', {
      'line': {
        'markers': ['/'],
        'exceptions': ['-', '+']
      },
      'block': {
        'markers': ['!'],
        'exceptions': ['*'],
        'balanced': true
      }
    }],
    '@typescript-eslint/no-explicit-any': ['warn'],

    '@typescript-eslint/prefer-optional-chain': ['warn'],
    '@typescript-eslint/no-empty-function': ['warn'],
    '@typescript-eslint/no-empty-interface': ['warn'],

    '@typescript-eslint/no-array-constructor': ['off'],

    'no-extra-parens': ['off'],
    '@typescript-eslint/no-extra-parens': [
      'error',
      'all',
      {
        ignoreJSX: 'multi-line',
        returnAssign: true,
        conditionalAssign: true,
        nestedBinaryExpressions: false,
        enforceForArrowConditionals: false,
        enforceForSequenceExpressions: false,
        enforceForNewInMemberExpressions: false
      }
    ]
  }
}
