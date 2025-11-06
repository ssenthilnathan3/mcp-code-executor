import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
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