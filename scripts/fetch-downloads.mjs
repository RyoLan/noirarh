// Fills ./downloads with the installers the site serves at /downloads/<file>.
// Takes the latest release build, and falls back to a local build (desktop/release,
// mobile/android) for anything the release does not have. Visitors only ever download from this site.
//   npm run downloads:fetch             latest release build, local builds as fallback
//   npm run downloads:fetch -- --local  local builds only
import { copyFileSync, createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.env.DOWNLOADS_DIR ?? 'downloads');
// where the release workflow publishes the builds (the build pipeline, not something visitors see)
const BUILD_SOURCE = process.env.NOIRA_BUILDS ?? 'https://github.com/RyoLan/noirarh/releases/latest/download';
const localOnly = process.argv.includes('--local');

const FILES = {
  'Noira-Setup.exe': ['desktop/release/Noira-Setup.exe'],
  'Noira-mac.dmg': ['desktop/release/Noira-mac.dmg'],
  'Noira-android.apk': ['mobile/android/app/build/outputs/apk/debug/app-debug.apk', 'Noira-android.apk'],
};

mkdirSync(out, { recursive: true });
const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function fromRelease(name, dest) {
  try {
    const res = await fetch(`${BUILD_SOURCE}/${name}`, { redirect: 'follow' });
    if (!res.ok || !res.body) return false;
    const tmp = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    renameSync(tmp, dest);
    return true;
  } catch {
    return false;
  }
}

for (const [name, locals] of Object.entries(FILES)) {
  const dest = path.join(out, name);
  if (!localOnly && (await fromRelease(name, dest))) {
    console.log(`✓ ${name}  ${mb(statSync(dest).size)}  from the latest release build`);
    continue;
  }
  const local = locals.map(p => path.join(root, p)).find(p => existsSync(p));
  if (local) {
    copyFileSync(local, dest);
    console.log(`✓ ${name}  ${mb(statSync(dest).size)}  from ${path.relative(root, local)}`);
  } else {
    console.log(`· ${name}  not built yet`);
  }
}

