import { defineConfig } from 'vite';

// Pages serves the site from haloman363.github.io/browser-strike-slice/, so
// every asset URL needs that prefix. Locally it must be '/' or dev breaks.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/browser-strike-slice/' : '/',
});
