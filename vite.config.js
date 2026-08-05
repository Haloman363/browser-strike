import { defineConfig } from 'vite';

// Pages serves the site from haloman363.github.io/<repo>/, so every asset URL
// needs that prefix. Locally it must be '/' or dev breaks.
//
// Derived from GITHUB_REPOSITORY ("owner/repo") rather than hardcoded: this was
// pinned to '/browser-strike-slice/' and renaming the repo silently shipped a
// site whose every asset 404'd, because the build still "succeeded".
export default defineConfig({
  base: process.env.GITHUB_ACTIONS
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : '/',
});
