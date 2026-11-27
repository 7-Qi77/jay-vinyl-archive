import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Image: 'readonly',
        Audio: 'readonly',
        indexedDB: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        CustomEvent: 'readonly',
        ResizeObserver: 'readonly',
        matchMedia: 'readonly',
        navigator: 'readonly',
        history: 'readonly',
        location: 'readonly',
        MediaMetadata: 'readonly',
        AudioContext: 'readonly',
        OfflineAudioContext: 'readonly',
        AudioWorkletNode: 'readonly',
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        Blob: 'readonly',
        URLSearchParams: 'readonly',
        HTMLElement: 'readonly',
        customElements: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly' }
    }
  },
  {
    ignores: ['assets/**', 'node_modules/**']
  }
];
