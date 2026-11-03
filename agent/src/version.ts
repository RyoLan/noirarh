import { readFileSync } from 'node:fs';

/** The package version, read once from package.json next to dist/ (or src/ in development). */
export const VERSION: string = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();
