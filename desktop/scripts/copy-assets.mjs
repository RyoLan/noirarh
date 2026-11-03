// Copies the built control panel and the tray icons next to the bundled main process.
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const panel = path.resolve(here, '../agent/dist/panel');
if (!existsSync(panel)) {
  console.error('The panel is not built yet. Run `npm run build -w agent` from the repository root first.');
  process.exit(1);
}
cpSync(panel, path.join(here, 'dist/panel'), { recursive: true });
for (const f of ['icon.png', 'tray.png']) cpSync(path.join(here, 'build', f), path.join(here, 'dist', f));
console.log('copied panel and icons into desktop/dist');
