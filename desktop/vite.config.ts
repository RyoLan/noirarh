import { defineConfig } from 'vite';

// Bundles the Electron main process together with the Noira agent into one file,
// so the packaged app ships no node_modules at all.
export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      external: ['electron'],
      output: { format: 'es', entryFileNames: 'main.js' },
    },
  },
  ssr: { noExternal: true, target: 'node' },
});
