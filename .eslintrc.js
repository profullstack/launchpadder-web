export default {
  root: true,
  extends: [
    'eslint:recommended',
    '@eslint/js/recommended',
    'prettier'
  ],
  plugins: ['svelte'],
  overrides: [
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      extends: [
        'eslint:recommended',
        'plugin:svelte/recommended',
        'prettier'
      ]
    }
  ],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2024
  },
  env: {
    browser: true,
    es2024: true,
    node: true
  },
  rules: {
    // Enforce modern JavaScript practices
    'prefer-const': 'error',
    'no-var': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-template': 'error',
    'object-shorthand': 'error',
    
    // Error handling
    'no-console': 'warn',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-undef': 'error',
    
    // Code quality
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    
    // Import/Export
    'no-duplicate-imports': 'error',
    
    // Async/Await
    'require-await': 'error',
    'no-return-await': 'error'
  },
  globals: {
    globalThis: false,
    NodeJS: false
  }
};