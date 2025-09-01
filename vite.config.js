import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // This is the "library mode" configuration.
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'threeshanshika', // The variable name in UMD builds
      fileName: (format) => `threeshanshika.${format}.js`,
    },
    // This is crucial to prevent bundling Three.js into our library.
    rollupOptions: {
      external: ['three'],
      output: {
        globals: {
          three: 'THREE',
        },
      },
    },
  },
});