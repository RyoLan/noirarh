import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The API lives in server/index.ts, which mounts Vite as middleware in dev,
// so there is no proxy to configure here.
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        docs: fileURLToPath(new URL('docs.html', import.meta.url)),
        admin: fileURLToPath(new URL('admin.html', import.meta.url)),
      },
    },
  },
});
