module.exports = {
  env: {
    node: true,
    es2021: true,
    commonjs: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script'
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': 'warn'
  }
};
