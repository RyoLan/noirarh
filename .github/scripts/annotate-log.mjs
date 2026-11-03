// Prints the tail of a log as one GitHub Actions error annotation.
// Job logs need a GitHub login to read; annotations are public on a public repository.
// node .github/scripts/annotate-log.mjs <file> "<title>"
import { readFileSync } from 'node:fs';

const [file, title = 'Build failed'] = process.argv.slice(2);
const tail = readFileSync(file, 'utf8').trim().split('\n').slice(-50).join('\n');
const escape = s => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
console.log(`::error title=${escape(title).replace(/[:,]/g, ' ')}::${escape(tail)}`);
