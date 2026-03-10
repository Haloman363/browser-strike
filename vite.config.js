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
      output: {
        manualChunks: {
          'three-core': ['three'],
          'three-webgpu': ['three/webgpu', 'three/tsl'],
          'factory': [
            resolve(__dirname, 'src/factory/FactoryUtils.js'),
            resolve(__dirname, 'src/factory/WeaponFactory.js'),
            resolve(__dirname, 'src/factory/CharacterFactory.js'),
            resolve(__dirname, 'src/factory/EnvironmentFactory.js')
          ]
        }
      }
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
