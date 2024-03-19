module.exports = {
  spec: 'tests/**/*.js',
  exit: true,
  reporter: 'spec',
  ui: 'bdd',
  require: ['./esbuild-setup.mjs'],
};
