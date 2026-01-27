module.exports = {
  spec: 'tests/**/*.js',
  exit: true,
  reporter: 'spec',
  ui: 'bdd',
  require: ['dotenv/config'],
  'node-option': ['import=tsx'],
  extension: ['ts', 'js'],
}
