import { defineConfig } from 'vite';

// base is set for GitHub Pages project-site hosting (D-008): the app is served
// from /<repo>/ rather than the domain root.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/rhythm-master/',
  build: { outDir: 'dist', emptyOutDir: true },
});
