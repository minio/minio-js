module.exports = {
  'env': {
    'node': true,
    'mocha': true,
    'es6': true
  },
  'extends': 'eslint:recommended',
  'parser': '@typescript-eslint/parser',
  'plugins': ['@typescript-eslint'],
  'parserOptions': {
    'sourceType': 'module',
    "ecmaVersion": 8
  },
  'rules': {
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
    "@typescript-eslint/no-explicit-any": ["warn"],

    "@typescript-eslint/prefer-optional-chain": ["warn"],
    "@typescript-eslint/no-empty-function": ["warn"],
    "@typescript-eslint/no-empty-interface": ["warn"],

    "@typescript-eslint/no-array-constructor": ["off"],

    "no-extra-parens": ["off"],
    "@typescript-eslint/no-extra-parens": [
      "error",
      "all",
      {
        ignoreJSX: "multi-line",
        returnAssign: true,
        conditionalAssign: true,
        nestedBinaryExpressions: false,
        enforceForArrowConditionals: false,
        enforceForSequenceExpressions: false,
        enforceForNewInMemberExpressions: false,
      },
    ],
  }
}
