const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['node_modules/**', 'backend/vendor/**', 'release/**', 'dist/**']
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        Buffer: 'readonly',
        AbortController: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        document: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        window: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
