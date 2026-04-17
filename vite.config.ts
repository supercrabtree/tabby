import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'firefox115',
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: mode === 'test' ? {
    alias: {
      'webextension-polyfill': fileURLToPath(new URL('./tests/mock-browser.ts', import.meta.url)),
    },
  } : undefined,
}));
