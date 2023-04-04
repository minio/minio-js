module.exports = {
  "env": {
    "node": true,
    "mocha": true,
    "es6": true
  },
  "ignorePatterns": ["src/test/*.*"],
  "overrides": [],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier" // This should be the last entry.
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "parserOptions": {
    "sourceType": "module",
    "ecmaVersion": 8
  },
  "rules": {
    "no-console": ["error"],
    // "no-var": ["error"],
    "comma-dangle": 0,
    "prefer-const": 0,
    // "quotes": ["error", "double"],
    "comma-spacing": 0, // ["error", { before: false, after: true }],
    "semi-spacing": 0, // ["warn", { before: false, after: true }],
    "space-before-blocks": 0, // ["warn", "always"],
    "switch-colon-spacing": ["warn", { after: true, before: false }],
    "keyword-spacing": 0, // ["warn", { before: true, after: true }],
    "template-curly-spacing": 0, // ["error", "never"],
    "rest-spread-spacing": 0, // ["error", "never"],
    "no-multi-spaces": 0, // ["warn", { ignoreEOLComments: false }],

    "indent": [
      "error",
      2,
      {
        "FunctionDeclaration": { "parameters": "first" },
        "FunctionExpression": { "parameters": "first" },
        "CallExpression": { "arguments": "first" },
        "ArrayExpression": "first",
        "ObjectExpression": "first"
      }
    ],
    "linebreak-style": [
      "error",
      "unix"
    ],
    "semi": ["error", "never"],
    "spaced-comment": ["error", "always", {
      "line": {
        "markers": ["/"],
        "exceptions": ["-", "+"]
      },
      "block": {
        "markers": ["!"],
        "exceptions": ["*"],
        "balanced": true
      }
    }],
    "@typescript-eslint/no-explicit-any": ["warn"],

    "@typescript-eslint/prefer-optional-chain": 0, // ["warn"],
    "no-empty-function": 0,
    "@typescript-eslint/no-empty-function": 0, // ["warn"],
    "@typescript-eslint/no-var-requires": 0,
    "@typescript-eslint/no-this-alias": 0,
    "@typescript-eslint/no-empty-interface": ["warn"],

    "@typescript-eslint/no-array-constructor": ["off"],

    "no-extra-parens": 0,
    "@typescript-eslint/no-extra-parens": 0
  }
}