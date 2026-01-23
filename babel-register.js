// fix babel register doesn't transform TypeScript
//
// https://github.com/babel/babel/issues/8962#issuecomment-443135379

const register = require('@babel/register')

register({
  extensions: ['.ts', '.js'],
  assumptions: {
    constantSuper: true,
    noIncompleteNsImportDetection: true,
    constantReexports: true,
  },
  plugins: [
    [
      '@babel/plugin-transform-modules-commonjs',
      {
        importInterop: 'node',
      },
    ],
    '@upleveled/remove-node-prefix', // lower version of node (<14) doesn't support require('node:fs')
  ],
  presets: [
    ['@babel/preset-typescript', { allExtensions: true }],
    ['@babel/preset-env', { targets: { node: 'current' }, modules: 'cjs' }],
  ],
})
