import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    ssr: true,
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    target: 'node22',
    rollupOptions: {
      external: ['electron'],
      input: {
        index: path.resolve(__dirname, 'src/main/index.ts'),
        preload: path.resolve(__dirname, 'src/main/preload.ts')
      },
      output: {
        dir: 'dist/main',
        format: 'cjs',
        entryFileNames: '[name].cjs'
      }
    }
  }
});
