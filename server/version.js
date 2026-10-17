




import fs from 'node:fs';
import path from 'node:path';

function readVersion() {
  for (const p of [path.join(import.meta.dirname, '..', 'package.json'), path.join(import.meta.dirname, 'package.json')]) {
    try { const v = JSON.parse(fs.readFileSync(p, 'utf8')).version; if (v) return v; } catch {}
  }
  return '0.0.0';
}
export const VERSION = readVersion();
