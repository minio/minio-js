module.exports = {
  'env': {
    'node': true,
    'mocha': true,
    'es6': true
  },
  'extends': 'eslint:recommended',
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
      (process.platform === 'win32' ? 'windows' : 'unix') // all windows platforms are denoted by win32
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
    }]
  }
}
