import { defineConfig } from 'vite';

// three.js goes in its own chunk: it changes far less often than the game code, so returning players keep it cached
// and only download the (smaller) game chunk after an update. Both chunks are fetched in parallel on first load.
export default defineConfig({
  base: './', // relative URLs: the build runs from any path (GitHub Pages serves it under /dropzone-99/)
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});
