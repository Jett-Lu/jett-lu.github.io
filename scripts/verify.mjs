import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const html = read('index.html');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML IDs');

function checkReference(value, base = root) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return;
  if (value.startsWith('#')) {
    assert(ids.includes(value.slice(1)), `Missing anchor ${value}`);
    return;
  }
  const path = decodeURIComponent(value.split(/[?#]/)[0]);
  assert(existsSync(resolve(base, path)), `Missing local asset ${value}`);
}

for (const [, value] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) checkReference(value);
for (const [, value] of html.matchAll(/\baria-(?:controls|labelledby|describedby)="([^"]+)"/g)) {
  for (const id of value.split(/\s+/)) assert(ids.includes(id), `Missing ARIA target ${id}`);
}
for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
  assert(/\brel="[^"]*\bnoopener\b/.test(match[0]), 'New-tab link needs noopener');
}

const scripts = ['script.js', 'racing-portal.js', 'arcade-portal.js', 'scripts/verify.mjs',
  ...readdirSync(resolve(root, 'tests')).filter(name => name.endsWith('.mjs')).map(name => `tests/${name}`)];
for (const path of scripts) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, path)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path}: ${result.error?.message || result.stderr}`);
  for (const [, specifier] of read(path).matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
    if (specifier.startsWith('.')) checkReference(specifier, dirname(resolve(root, path)));
  }
}

const provenance = JSON.parse(read('vendor/three/provenance.json'));
for (const file of provenance.files) {
  const bytes = readFileSync(resolve(root, 'vendor/three', file.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Changed vendored file: ${file.path}`);
}
console.log(`PASS: ${scripts.length} JavaScript syntax checks, HTML links/IDs/ARIA targets, local module imports, and ${provenance.files.length} dependency checksums.`);
