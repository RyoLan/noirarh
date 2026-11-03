import { defineConfig } from 'vite';

// The API lives in server/index.ts, which mounts Vite as middleware in dev,
// so there is no proxy to configure here.
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
