import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/browser-strike/',
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dev: resolve(__dirname, 'dev.html'),
        mapDev: resolve(__dirname, 'map-dev.html'),
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
