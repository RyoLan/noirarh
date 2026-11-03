import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

// The control panel: built into dist/panel, served by the gateway at /panel.html
// and bundled into the desktop and Android apps.
export default defineConfig({
  root: here,
  base: './',
  publicDir: 'public',
  build: {
    outDir: '../dist/panel',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: `${here}panel.html` },
  },
});
