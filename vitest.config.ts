import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/cli/index.ts', // CLI entry point
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/mcp': resolve(__dirname, './src/mcp'),
      '@/generator': resolve(__dirname, './src/generator'),
      '@/bridge': resolve(__dirname, './src/bridge'),
      '@/runtime': resolve(__dirname, './src/runtime'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/cli': resolve(__dirname, './src/cli'),
    },
  },
});