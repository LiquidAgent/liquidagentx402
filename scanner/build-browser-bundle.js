// Build the browser bundle of the scanner engine (v1.3.2).
// The engine core (RULES + helpers + attribute + scanContent) is pure
// string work; only scanFile/collectFiles/main use Node (fs/path/process).
// This script cuts those out, shims path.basename, and exposes the
// engine as window.MalwareScanner (and module.exports for Node tests).
// Run: node build-browser-bundle.js
// Verifies the bundle against the Node engine on the fixtures.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'scanner.js');
const OUT = path.join(__dirname, 'scanner-browser.js');

let src = fs.readFileSync(SRC, 'utf8');
// Drop the shebang (it must be line 1; the shim goes first instead)
// and the Node requires; shim the one path call the core uses.
src = src.replace('#!/usr/bin/env node\n', '');
src = src.replace("const fs = require('fs');\n", '');
src = src.replace("const path = require('path');\n", '');
const shim = "const path = { basename: (f) => String(f).split(/[\\\\/]/).pop() };\n";
// Cut everything from scanFile (Node-only) to the end of the file.
const cutAt = src.indexOf('function scanFile(file) {');
if (cutAt < 0) throw new Error('scanFile not found — scanner.js layout changed, fix this script');
src = src.slice(0, cutAt);
src = shim + src;
src += `
const MalwareScanner = { scanContent, attribute, RULES, VERSION: '1.3.2' };
if (typeof window !== 'undefined') window.MalwareScanner = MalwareScanner;
if (typeof module !== 'undefined' && module.exports) module.exports = MalwareScanner;
`;
fs.writeFileSync(OUT, src);
console.log('wrote', OUT, src.length, 'bytes');

// Verify: bundle scores must match the Node engine exactly.
const nodeEngine = require('./scanner.js');
const bundle = require('./scanner-browser.js');
const cases = [
  ['test/clean/postcss.config.mjs', 0],
  ['test/clean/eslint.config.mjs', 0],
  ['test/clean/tailwind.config.js', 0],
  ['test/clean/tasks.json', 0],
  ['test/malicious-shaped/config-after-export.mjs', 80],
  ['test/malicious-shaped/marker-v1.mjs', 60],
  ['test/malicious-shaped/npm_cli.js', 50],
  ['test/malicious-shaped/tasks.json', 40],
  ['test/variants/01/postcss.config.mjs', 100],
  ['test/variants/02/postcss.config.mjs', 0],
  ['test/variants/03/postcss.config.mjs', 80],
  ['test/variants/04/postcss.config.mjs', 100],
  ['test/variants/05/postcss.config.mjs', 100],
  ['test/variants/06/eslint.config.mjs', 80],
  ['test/variants/07/postcss.config.mjs', 60],
  ['test/variants/08/postcss.config.mjs', 100],
  ['test/variants/09/postcss.config.mjs', 20],
  ['test/variants/11/postcss.config.mjs', 80],
  ['test/variants/10-minified-clean.min.js', 0],
  ['test/variants/pkg-malicious-postinstall/package.json', 55],
  ['test/variants/pkg-node-eval-preinstall/package.json', 55],
  ['test/variants/pkg-benign-postinstall/package.json', 15],
  ['test/variants/pkg-clean/package.json', 0],
];
let bad = 0;
for (const [file, expected] of cases) {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const a = nodeEngine.scanContent(file, content);
  const b = bundle.scanContent(file, content);
  const ok = a.score === expected && b.score === expected && a.score === b.score
    && a.attribution.family === b.attribution.family;
  if (!ok) { bad++; console.log('MISMATCH', file, 'node=', a.score, 'bundle=', b.score, 'expected=', expected); }
}
console.log(bad === 0 ? `bundle verified: ${cases.length}/${cases.length} scores match the Node engine` : `${bad} mismatches — DO NOT SHIP`);
process.exit(bad === 0 ? 0 : 1);
