import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Every deployed build carries a legible version stamp (CLAUDE.md §6): a
// <meta name="build-version"> tag injected into index.html at build time, so
// view-source on the live site answers "which build is this?" without
// spending any screen real estate.
function buildStamp() {
  return {
    name: 'build-stamp',
    apply: 'build',
    transformIndexHtml() {
      const built = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
      let commit = 'uncommitted';
      try {
        commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
      } catch {
        // not a git checkout — the timestamp alone still identifies the build
      }
      return [
        {
          tag: 'meta',
          attrs: { name: 'build-version', content: `${built} (${commit})` },
          injectTo: 'head',
        },
      ];
    },
  };
}

// base is set for GitHub Pages project-site hosting (D-008): the app is served
// from /<repo>/ rather than the domain root.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/rhythm-master/',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [buildStamp()],
});
