/**
 * Separate Vite build configuration for the content script.
 * Outputs an IIFE bundle at dist/src/content/index.js so the popup
 * can inject it via chrome.scripting.executeScript({ files: ['src/content/index.js'] }).
 *
 * This runs AFTER the main vite build (which uses emptyOutDir: true).
 * Order in package.json: vite build && vite build --config vite.content.config.ts
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // must not wipe the main build output
    rollupOptions: {
      input: {
        // Input key 'src/content/index' → output at dist/src/content/index.js
        'src/content/index': resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        format: 'iife',
        // No output.name: the module has no exports (side-effects only),
        // so Rollup won't wrap with a var assignment.
        entryFileNames: '[name].js',
        // Inline all chunks so the script is fully self-contained.
        inlineDynamicImports: true,
      },
    },
  },
});
