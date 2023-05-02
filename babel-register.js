// fix babel register doesn't transform TypeScript
//
// https://github.com/babel/babel/issues/8962#issuecomment-443135379

// eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-commonjs
const register = require('@babel/register')

register({
  extensions: ['.ts', '.js'],
  plugins: [
    '@upleveled/remove-node-prefix', // lower version of node (<14) doesn't support require('node:fs')
  ],
  presets: [
    ['@babel/preset-typescript', { allExtensions: true }],
    ['@babel/preset-env', { targets: { node: 'current' }, modules: 'cjs' }],
  ],
})
