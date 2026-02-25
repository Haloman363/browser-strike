import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/browser-strike/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dev: resolve(__dirname, 'dev.html'),
        mapDev: resolve(__dirname, 'map-dev.html'),
      },
    },
  },
});
