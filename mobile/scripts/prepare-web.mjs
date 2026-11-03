// Builds the app's web assets from the agent's control panel. The phone never runs the agent:
// the panel opens on a "Connect to your gateway" screen and talks to a gateway over the network.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const panel = path.resolve(here, '../agent/dist/panel');
if (!existsSync(panel)) {
  console.error('The panel is not built yet. Run `npm run build -w agent` from the repository root first.');
  process.exit(1);
}
const www = path.join(here, 'www');
rmSync(www, { recursive: true, force: true });
cpSync(panel, www, { recursive: true });
rmSync(path.join(www, 'sw.js'), { force: true });
const html = readFileSync(path.join(www, 'panel.html'), 'utf8').replace('<!--NOIRA_BOOT-->', '<script>window.NOIRA_REMOTE=true</script>');
writeFileSync(path.join(www, 'index.html'), html);
rmSync(path.join(www, 'panel.html'));
console.log('mobile/www ready (remote panel)');
