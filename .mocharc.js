module.exports = {
  spec: 'tests/**/*.js',
  exit: true,
  reporter: 'spec',
  ui: 'bdd',
  require: ['nock', 'dotenv/config', 'source-map-support/register', './babel-register.js'],
}
