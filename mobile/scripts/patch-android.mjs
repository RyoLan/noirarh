// Lets the app reach a gateway over plain http on a private network (Tailscale, home Wi-Fi),
// which Android blocks by default. Safe to run more than once.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.join(here, 'android/app/src/main/AndroidManifest.xml');
if (!existsSync(manifest)) {
  console.error('No Android project yet: run `npm run add -w mobile` first.');
  process.exit(1);
}
let xml = readFileSync(manifest, 'utf8');
if (!xml.includes('android:usesCleartextTraffic')) {
  xml = xml.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
  writeFileSync(manifest, xml);
  console.log('AndroidManifest: cleartext traffic allowed for private-network gateways');
} else {
  console.log('AndroidManifest already allows cleartext traffic');
}
