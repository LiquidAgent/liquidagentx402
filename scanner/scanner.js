#!/usr/bin/env node
// Liquid Agent malware scanner engine v1.3.2 — PolinRider + Shai-Hulud
// v1.3.2 (Nov 9, 2026): trait-calibration fixes from the Nov 9
// per-trait analysis (55,171 clean files vs malicious corpora):
//  T02 weight 25 -> 20 (alone it caused 227/251 clean reviews);
//  T38 weight 25 -> 20 (clean fires are all legit Actions OIDC use);
//  T30 weight 40 -> 50 (0 clean fires; the 2 @cap-js setup.mjs
//  loaders scored 40 review on T30 alone and are worm loaders);
//  T04 global-require branch widened to nested brackets so the
//  blob's global[_$_3035[0]]= require now matches (was unreachable).
// v1.3.1 (Nov 8, 2026): T01 false-positive fix — config filenames only
// + blob-shape trailing requirement (see T01 comment).
// v1.3.0 (Nov 8, 2026): PACK 2 — Shai-Hulud rules T26-T38, from the
// public-traits research (other-malware-families-traits-20261108-2106).
// Fixes the attribution bug the ground-truth test found: v1 bundle.js
// files attributed as PolinRider medium. Shai-Hulud traits now take
// precedence in attribute(), so a Shai-Hulud file is named Shai-Hulud.
// v1.2.1 (Nov 8, 2026): T24/T25 package.json install hooks (the npm
// supply-chain gap — install scripts scored 0 before this).
// v1.2 (Nov 8, 2026): scanContent() exported for scan-history.js; main()
// only runs when invoked directly. Rules unchanged from v1.1.
// v1.1 fixes (Nov 8, 2026, from the real BlackChain sample test):
//  T01 now handles `export default config;` identifier exports,
//  T06 hex-offset decoder weight 20 -> 30 (eslint variant now blocks),
//  T10 matches npm_cli.js.txt evidence copies too.
// Static text analysis ONLY. Never executes, requires, imports, or evals
// the scanned file. Reads it as text and checks it against the traits in
// ../malware-family-traits-2026-11-08.md (v1 + v2).
// Usage: node scanner.js <file-or-dir> [--json]
// Exit 0 = clean/allow, 1 = review, 2 = block. JSON to stdout with --json.
const fs = require('fs');
const path = require('path');

const RULES = [
  { id: 'T01', name: 'Obfuscated code appended after config export', weight: 40, confidence: 'High',
    test: (c, f) => {
      // v1.3.1 fix (false-positive root cause, Nov 8, 2026): T01 used to
      // fire on ANY file with `export default` followed by more code —
      // normal modules, tests, bundled dist files, even .md docs with
      // code samples. In the clean corpus that was 11.8% of files in
      // review. Two guards now:
      //  (1) config filenames only — T01 is a config trait. A file is
      //      config-like when its name contains "config" (eslint,
      //      postcss, tailwind, vite, next, ...) or is server.js/App.js.
      //  (2) blob shape — the trailing code must look like an appended
      //      payload (giant line, off-screen padding, eval, decoder),
      //      not readable code. Legit configs put readable helpers
      //      after the export: vite's playground optimize-deps config
      //      has 5,593 chars of helpers after `export default` and
      //      must NOT fire. Size alone cannot distinguish it.
      if (!isConfigFile(f)) return null;
      const after = codeAfterExport(c);
      if (!after || after.length <= 20) return null;
      const longLine = after.split('\n').find((l) => l.length > 1000);
      if (longLine) return `code after export (line of ${longLine.length} chars)`;
      if (/ {200,}/.test(after)) return 'code after export (whitespace padding)';
      if (/\beval\s*\(/.test(after) || /new\s+Function\s*\(/.test(after)) return 'code after export (eval)';
      if (/_\$_\d+/.test(after)) return 'code after export (deobfuscator _$_NNNN)';
      if (/function\s+c\s*\(\s*b\s*,\s*d\s*\)/.test(after)) return 'code after export (decoder c(b,d))';
      if (/decodeURIComponent/.test(after) && /ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\+\/=/.test(after)) return 'code after export (base64 decoder)';
      // A confirmed family marker in the appended code is itself the
      // payload signature: marker anywhere is 40 (review), but a marker
      // appended after a config export is the PolinRider shape, so it
      // stacks to a block. (Without this, the minimal v2-marker variant
      // — marker strings only, no blob — drops to review.)
      if (/7-d37|rmcej%otb%|Cot%3t=shtP|_\$_1e42/.test(after)) return 'code after export (confirmed family marker)';
      if (/global\[._V.\]\s*=\s*['"]8-stN['"]/.test(after)) return "code after export (global['_V']='8-stN')";
      return null;
    } },
  { id: 'T02', name: 'Long single-line obfuscated blob', weight: 20, confidence: 'High',
    test: (c, f) => {
      // v1.2 fix: minified bundles and source maps are legitimately
      // single-line, so T02 does not fire on .min.js or .map files.
      if (f && (f.endsWith('.min.js') || f.endsWith('.map'))) return null;
      const lines = c.split('\n');
      const long = lines.find((l) => l.length > 2000);
      if (long) return `single line of ${long.length} chars`;
      return null;
    } },
  { id: 'T15', name: 'Whitespace padding pushing code off-screen', weight: 15, confidence: 'High',
    test: (c) => {
      const m = c.match(/ {200,}/);
      if (m) return `${m[0].length} consecutive spaces`;
      return null;
    } },
  { id: 'T03', name: "Confirmed marker global.o='7-d37XX'", weight: 40, confidence: 'High',
    test: (c) => c.includes("global.o='7-d37") || c.includes('global.o="7-d37') || c.includes("global['o']='7-d37") ? '7-d37 marker' : null },
  { id: 'T11', name: "Original marker rmcej%otb% / _$_1e42 / global['!']", weight: 40, confidence: 'High',
    test: (c) => {
      if (c.includes('rmcej%otb%')) return 'rmcej%otb%';
      if (c.includes('_$_1e42')) return '_$_1e42';
      if (c.includes("global['!']")) return "global['!']";
      return null;
    } },
  { id: 'T12', name: "Rotated marker Cot%3t=shtP / MDy / global['_V']='8-stN'", weight: 40, confidence: 'Medium-High',
    test: (c) => {
      if (c.includes('Cot%3t=shtP')) return 'Cot%3t=shtP';
      if (c.includes("global['_V']='8-stN'")) return "global['_V']='8-stN'";
      if (/\bMDy\s*\(/.test(c)) return 'MDy decoder call';
      return null;
    } },
  { id: 'T13', name: 'Later global.i A# hunt lead', weight: 10, confidence: 'Low-Medium',
    test: (c) => /global\.i\s*=\s*["']A\d+-/.test(c) ? 'global.i A# pattern' : null },
  { id: 'T04', name: 'Require smuggling in ESM config', weight: 20, confidence: 'High',
    test: (c) => {
      if (/createRequire\s*\(\s*import\.meta\.url\s*\)/.test(c)) return 'createRequire(import.meta.url)';
      // v1.3.2: nested brackets allowed — the blob writes
      // global[_$_3035[0]]= require, which [^\]]+ cannot match
      // (it stops at the inner ]). .* is line-scoped (no newlines)
      // and pre-measured at 0 fires on the 55,171-file clean corpus.
      if (/global\[.*\]\s*=\s*require/.test(c)) return 'global[...] = require';
      if (/global\[.r.\]\s*=\s*require/.test(c)) return "global['r'] = require";
      return null;
    } },
  { id: 'T05', name: 'Character-shuffle deobfuscator', weight: 20, confidence: 'Medium-High',
    test: (c) => {
      if (/_\$_\d+/.test(c)) return 'deobfuscator function _$_NNNN';
      if (/p\s*\*\s*\(v\s*\+\s*324\)/.test(c)) return 'shuffle arithmetic p*(v+324)';
      return null;
    } },
  { id: 'T06', name: 'Hex-offset base64 decoder', weight: 30, confidence: 'Medium-High',
    test: (c) => {
      if (/decodeURIComponent/.test(c) && /ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\+\/=/.test(c)) return 'base64 alphabet + decodeURIComponent';
      if (/function\s+c\s*\(\s*b\s*,\s*d\s*\)/.test(c)) return 'decoder c(b,d)';
      return null;
    } },
  { id: 'T07', name: 'eval() / Function() on decoded code', weight: 20, confidence: 'High',
    test: (c) => {
      if (/\beval\s*\(/.test(c)) return 'eval(';
      if (/new\s+Function\s*\(/.test(c)) return 'new Function(';
      return null;
    } },
  { id: 'T08', name: 'Fake Rabby extension ID', weight: 50, confidence: 'High',
    test: (c) => c.includes('acmacodkjbdgmoleebolmdjonilkdbch') ? 'fake Rabby extension ID' : null },
  { id: 'T09-case', name: 'Case-specific manifest __meta + 7-d37 (hunt lead only)', weight: 30, confidence: 'Low (case-specific)',
    test: (c, f) => {
      if (f.endsWith('manifest.json') && c.includes('__meta') && c.includes('7-d37')) return '__meta + 7-d37 in manifest';
      return null;
    } },
  { id: 'T10', name: 'Trojanized npm_cli.js', weight: 30, confidence: 'High',
    test: (c, f) => {
      // v1.1 fix: match npm_cli.js.txt evidence copies too, not just the exact name.
      if (path.basename(f).startsWith('npm_cli.js') && (c.split('\n').length > 15 || /\beval\s*\(/.test(c))) return 'npm_cli.js long or contains eval';
      return null;
    } },
  { id: 'T16', name: 'VS Code tasks.json runOn folderOpen executing asset', weight: 40, confidence: 'High',
    test: (c, f) => {
      if (path.basename(f) === 'tasks.json' && /runOn\s*["']\s*:\s*["']folderOpen/.test(c) && /node\s+\S+\.(woff2|svg)/.test(c)) return 'tasks.json folderOpen + node woff2/svg';
      if (path.basename(f) === 'tasks.json' && /runOn\s*["']\s*:\s*["']folderOpen/.test(c) && /core\.hooksPath/.test(c)) return 'tasks.json folderOpen + hooksPath';
      return null;
    } },
  { id: 'T17', name: 'Fake font/SVG file containing JS', weight: 30, confidence: 'Medium-High',
    test: (c, f) => {
      if ((f.endsWith('.woff2') || f.endsWith('.svg')) && /(export\s+default|require\(|eval\(|function\s+\w+\s*\()/.test(c)) return 'woff2/svg contains JS code';
      return null;
    } },
  { id: 'T19', name: "Detached node -e child", weight: 25, confidence: 'High',
    test: (c) => {
      if (/spawn\s*\(\s*['"]node['"]\s*,\s*\[\s*['"]-e['"]/.test(c)) return "spawn node -e";
      if (/node\s+-e\b/.test(c) && /global\[._V.\]/.test(c)) return 'node -e with global _V';
      if (/-skipwarn/.test(c)) return '-skipwarn flag';
      return null;
    } },
  { id: 'T20', name: 'Blockchain RPC then plain HTTP / Sec-V beacon', weight: 25, confidence: 'High',
    test: (c) => {
      if (c.includes('Sec-V')) return 'Sec-V header';
      if (c.includes('/0x/cls') || c.includes('/0x/ls')) return '/0x/cls or /0x/ls endpoint';
      if (c.includes('/$/boot')) return '/$/boot endpoint';
      if (/eth_call|eth_getTransactionByHash/.test(c)) return 'blockchain JSON-RPC call';
      return null;
    } },
  { id: 'T21', name: 'Wallet / keychain enumeration', weight: 20, confidence: 'High',
    test: (c) => {
      if (c.includes('.ldb') && /extension/i.test(c)) return '.ldb extension enumeration';
      if (c.includes('.config/solana/id.json')) return 'Solana id.json path';
      if (c.includes('login.keychain')) return 'macOS login.keychain path';
      return null;
    } },
  { id: 'T22', name: 'Portable-Python staging paths', weight: 20, confidence: 'Medium-High',
    test: (c) => {
      if (c.includes('.pyp\\python.exe') || c.includes('.pyp/python.exe')) return '.pyp python.exe';
      if (c.includes('.npl') && c.includes('python')) return '.npl python payload';
      if (c.includes('store.node')) return 'store.node';
      if (c.includes('/.n2/') || c.includes('\\.n2\\')) return '.n2 hidden dir';
      return null;
    } },
  { id: 'T23', name: 'InvisibleFerret persistence artefact', weight: 25, confidence: 'High',
    test: (c, f) => {
      if (path.basename(f) === 'queue.bat') return 'queue.bat Startup file';
      if (c.includes('com.avatar.update.wake.plist')) return 'com.avatar.update.wake.plist';
      return null;
    } },
  { id: 'T24', name: 'Risky package.json install hook (remote code execution)', weight: 40, confidence: 'High',
    test: (c, f) => {
      if (path.basename(f) !== 'package.json') return null;
      const hooks = installHookScripts(c);
      if (!hooks.length) return null;
      for (const [name, script] of hooks) {
        if (/\b(curl|wget)\b[^"]*\|\s*(sh|bash|zsh|powershell)\b/i.test(script)) return `${name}: downloads and pipes to shell`;
        if (/\bnode\s+-e\b/.test(script)) return `${name}: node -e inline code`;
        if (/\b(powershell|pwsh)\b[^"]*(-enc|Invoke-Expression|\bIEX\b|DownloadString)/i.test(script)) return `${name}: PowerShell download/execute`;
        if (/\b(certutil|bitsadmin)\b/i.test(script)) return `${name}: certutil/bitsadmin download`;
        if (/base64\s+(-d|--decode)/.test(script)) return `${name}: base64 decode`;
        if (/Buffer\.from\([^)]*,\s*['"]base64['"]\)/.test(script)) return `${name}: base64 decode in JS`;
        if (/eval\s*\(/.test(script)) return `${name}: eval in install hook`;
      }
      return null;
    } },
  { id: 'T25', name: 'package.json install hook present (code runs at install)', weight: 15, confidence: 'Medium',
    test: (c, f) => {
      if (path.basename(f) !== 'package.json') return null;
      const hooks = installHookScripts(c);
      const risky = hooks.filter(([n]) => ['preinstall', 'install', 'postinstall'].includes(n));
      if (risky.length) return `install hook(s): ${risky.map(([n]) => n).join(', ')}`;
      return null;
    } },
  // --- Pack 2: Shai-Hulud (SH-01..SH-29 in the research report) ---
  { id: 'T26', name: 'Shai-Hulud loader install hook (bundle.js / setup_bun.js / setup.mjs)', weight: 40, confidence: 'High',
    test: (c, f) => {
      if (path.basename(f) !== 'package.json') return null;
      const hooks = installHookScripts(c);
      for (const [name, script] of hooks) {
        if (/\b(bundle\.js|setup_bun\.js|bun_environment\.js|setup\.mjs)\b/.test(script)) return `${name}: runs ${script.trim().slice(0, 60)}`;
      }
      return null;
    } },
  { id: 'T27', name: 'TruffleHog credential scan invocation', weight: 30, confidence: 'High',
    test: (c) => /trufflehog/i.test(c) ? 'trufflehog reference' : null },
  { id: 'T28', name: 'AWS key pattern (harvest regex)', weight: 25, confidence: 'High',
    test: (c) => /AKIA[0-9A-Z]{16}/.test(c) ? 'AKIA key pattern' : null },
  { id: 'T29', name: 'Shai-Hulud family strings (critical singleton)', weight: 50, confidence: 'High',
    test: (c) => {
      if (/shai-hulud/i.test(c)) return 'Shai-Hulud string';
      if (/sha1-hulud/i.test(c)) return 'Sha1-Hulud string';
      if (/WORMTAG/i.test(c)) return 'WORMTAG';
      if (/gh-token-monitor/i.test(c)) return 'gh-token-monitor';
      if (/IfYouRevokeThisTokenItWillWipeTheComputerOfTheOwner/.test(c)) return 'dead-man switch literal';
      if (/SHA1HULUD/.test(c)) return 'SHA1HULUD runner name';
      return null;
    } },
  { id: 'T30', name: 'Shai-Hulud v2 / Mini loader filename', weight: 50, confidence: 'High',
    test: (c, f) => {
      const base = path.basename(f);
      if (base === 'setup_bun.js' || base === 'bun_environment.js') return `worm loader file ${base}`;
      if (base === 'setup.mjs') return 'setup.mjs loader (Mini/ChainDrop)';
      return null;
    } },
  { id: 'T31', name: 'Worm persistence artefact (workflow / secrets exfil)', weight: 30, confidence: 'High',
    test: (c, f) => {
      const base = path.basename(f);
      if (base === 'shai-hulud-workflow.yml' || base === 'discussion.yaml' || base === 'formatter_123456789.yml') return `worm workflow file ${base}`;
      if (/toJSON\(secrets\)/.test(c)) return 'toJSON(secrets) exfil';
      if (/shai-hulud-workflow\.yml/.test(c)) return 'shai-hulud-workflow.yml reference';
      return null;
    } },
  { id: 'T32', name: 'Worm propagation API calls', weight: 30, confidence: 'High',
    test: (c) => {
      if (/\/-\/whoami/.test(c)) return 'npm /-/whoami';
      if (/\/-\/v1\/search\?text=maintainer/.test(c)) return 'maintainer search API';
      if (/npm version patch/.test(c)) return 'npm version patch (republish)';
      if (/searchForExistingTokens/.test(c)) return 'searchForExistingTokens';
      if (/octokit\.rest\.search\.repos/.test(c)) return 'octokit repo search';
      return null;
    } },
  { id: 'T33', name: 'Wiper / dead-man switch execution', weight: 40, confidence: 'High',
    test: (c) => {
      if (/destroySystem/.test(c)) return 'destroySystem function';
      if (/shred\s+-uvz/.test(c)) return 'shred -uvz';
      if (/cipher\s+\/W:/.test(c)) return 'cipher /W wipe';
      return null;
    } },
  { id: 'T34', name: 'Cloud credential harvest (IMDS / cloud paths)', weight: 25, confidence: 'High',
    test: (c) => {
      if (c.includes('169.254.169.254')) return 'cloud metadata endpoint 169.254.169.254';
      if (c.includes('~/.aws/credentials') || c.includes('.aws/credentials')) return 'AWS credentials path';
      if (c.includes('application_default_credentials.json')) return 'GCP credentials path';
      if (/ListSecretsCommand|GetSecretValueCommand/.test(c)) return 'cloud secrets-manager API';
      return null;
    } },
  { id: 'T35', name: 'Wholesale environment dump', weight: 20, confidence: 'High',
    test: (c) => /JSON\.stringify\(process\.env\)/.test(c) ? 'JSON.stringify(process.env)' : null },
  { id: 'T36', name: 'ChainDrop Ethereum C2 contract address', weight: 40, confidence: 'Medium',
    test: (c) => c.includes('0xE1f2395ee43e45A1556EC6438a88c31B83493103') ? 'ChainDrop C2 contract' : null },
  { id: 'T37', name: 'binding.gyp build-time execution bypass', weight: 30, confidence: 'High',
    test: (c, f) => {
      if (path.basename(f) !== 'binding.gyp') return null;
      if (/\b(curl|wget|exec|powershell|node)\b/i.test(c)) return 'binding.gyp contains shell/node command';
      return null;
    } },
  { id: 'T38', name: 'OIDC token theft (Actions identity)', weight: 20, confidence: 'High',
    test: (c) => {
      if (c.includes('ACTIONS_ID_TOKEN_REQUEST_URL') || c.includes('ACTIONS_ID_TOKEN_REQUEST_TOKEN')) return 'Actions OIDC token env';
      if (c.includes('/-/npm/v1/oidc/token/exchange')) return 'npm OIDC token exchange';
      return null;
    } },
];

// T01 guard (v1.3.1): is this file a config carrier? Any basename
// containing "config" (eslint/postcss/tailwind/vite/next/astro/webpack/
// metro configs, plus config-after-export fixtures) or server.js/App.js.
// Test files are never config carriers, even when "config" is in the
// name — next.js has edge-runtime-configurable-guards.test.ts, which
// scored 60 (T01+T07) in the first v1.3.1 corpus run.
function isConfigFile(f) {
  if (!f) return false;
  const base = path.basename(f);
  if (/\.test\.|\.spec\.|__tests__/.test(base)) return false;
  if (/config/i.test(base)) return true;
  if (base === 'server.js' || base === 'App.js') return true;
  return false;
}

// T01 helper: the stripped code after a config's export, or null.
// Handles identifier exports (`export default config;`, v1.1 fix) and
// object/array exports, with string-aware brace matching so globs like
// "*.{js,ts}" do not count. Comments are stripped.
function codeAfterExport(c) {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').trim();
  const idExport = c.match(/(?:export\s+default|module\.exports\s*=)\s*([A-Za-z_$][\w$]*)\s*;/);
  if (idExport) {
    return strip(c.slice(idExport.index + idExport[0].length));
  }
  const m = c.match(/export\s+default|module\.exports\s*=/);
  if (!m) return null;
  let start = -1;
  for (let i = m.index + m[0].length; i < c.length; i++) {
    if (c[i] === '{' || c[i] === '[') { start = i; break; }
    if (c[i] === ';') return null; // export with no object value
  }
  if (start < 0) return null;
  const open = c[start]; const close = open === '{' ? '}' : ']';
  let depth = 0; let quote = null; let escaped = false;
  for (let i = start; i < c.length; i++) {
    const ch = c[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return strip(c.slice(i + 1).replace(/^;/, '')); }
  }
  return null;
}

// Extract install-hook scripts from package.json text. Works on the raw
// text (no JSON parse needed, so a malformed file still gets checked).
// Returns [[hookName, script], ...] for preinstall/install/postinstall/prepare.
function installHookScripts(c) {
  const out = [];
  const re = /"(preinstall|install|postinstall|prepare)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(c)) !== null) out.push([m[1], m[2]]);
  return out;
}

// Family attribution (v1.3, Nov 8, 2026). Names the malware a flagged
// file is possibly infected with — best-of-class answers name the family,
// not just a score. Confidence is tiered and honest: static traits alone
// are never 100% certain, so a match without a confirmed marker is
// "consistent with", never asserted as fact.
// Precedence: Shai-Hulud first (family strings / loader traits), then
// PolinRider, then BeaverTail/InvisibleFerret — the generic loader
// shape overlaps families, so family-specific traits outrank it.
//  high: a confirmed family marker fired (T03 7-d37, T11 v1 rmcej%otb%,
//        T12 v2 Cot%3t, T08 fake Rabby extension ID).
//  medium: the PolinRider loader shape without a marker — code after a
//        config export (T01) plus a blob/decoder/eval (T02/T05/T06/T07),
//        or the trojanized npm CLI (T10) with a blob/eval, or the
//        case-specific manifest marker (T09). Also second-stage traits
//        (T19-T23) attribute to BeaverTail / InvisibleFerret, the later
//        stages of the same Contagious Interview campaign.
//  none: findings exist but match no family — generic obfuscated loader.
//  null: no findings at all.
function attribute(findings) {
  const has = (...ids) => findings.some((f) => ids.includes(f.trait));
  const ids = findings.map((f) => f.trait);
  if (!findings.length) return { family: null, confidence: null, campaign: null, basis: [] };
  // Pack 2 (v1.3.0): Shai-Hulud is checked FIRST. The generic loader
  // shape (T01+T02+T04+T07) overlaps families, and the ground-truth
  // test showed v1 bundle.js files misattributing as PolinRider
  // medium. Family-specific traits outrank the generic shape.
  const SH_HIGH = ['T29', 'T36'];
  const SH = ['T26', 'T27', 'T28', 'T29', 'T30', 'T31', 'T32', 'T33', 'T34', 'T35', 'T36', 'T37', 'T38'];
  if (has(...SH_HIGH) || (has('T26') && has('T27', 'T28', 'T31', 'T32')) || (has('T30') && has('T27', 'T32', 'T33')) || (has('T31') && has('T32'))) {
    return { family: 'Shai-Hulud', confidence: 'high', campaign: 'npm supply-chain worm', basis: ids.filter((t) => SH.includes(t)) };
  }
  if (has('T26') || has('T30') || (has('T27') && has('T28')) || has('T31') || has('T33') || (has('T32') && has('T34', 'T35'))) {
    return { family: 'Shai-Hulud', confidence: 'medium', campaign: 'npm supply-chain worm', basis: ids.filter((t) => SH.includes(t)) };
  }
  if (has('T03', 'T11', 'T12', 'T08')) {
    return { family: 'PolinRider', confidence: 'high', campaign: 'Contagious Interview', basis: ids.filter((t) => ['T03', 'T11', 'T12', 'T08'].includes(t)) };
  }
  if (has('T19', 'T20', 'T21', 'T22', 'T23')) {
    return { family: 'BeaverTail / InvisibleFerret', confidence: 'medium', campaign: 'Contagious Interview', basis: ids.filter((t) => ['T19', 'T20', 'T21', 'T22', 'T23'].includes(t)) };
  }
  if (has('T01') && has('T02', 'T05', 'T06', 'T07')) {
    return { family: 'PolinRider', confidence: 'medium', campaign: 'Contagious Interview', basis: ids.filter((t) => ['T01', 'T02', 'T05', 'T06', 'T07'].includes(t)) };
  }
  if (has('T10') && has('T02', 'T07')) {
    return { family: 'PolinRider', confidence: 'medium', campaign: 'Contagious Interview', basis: ids.filter((t) => ['T10', 'T02', 'T07'].includes(t)) };
  }
  if (has('T09-case')) {
    return { family: 'PolinRider', confidence: 'medium', campaign: 'Contagious Interview', basis: ['T09-case'] };
  }
  return { family: 'Unknown', confidence: null, campaign: null, basis: ids };
}

function scanContent(file, content) {
  const findings = [];
  for (const rule of RULES) {
    let detail = null;
    try { detail = rule.test(content, file); } catch { detail = null; }
    if (detail) findings.push({ trait: rule.id, name: rule.name, confidence: rule.confidence, weight: rule.weight, detail });
  }
  let score = findings.reduce((s, f) => s + f.weight, 0);
  if (score > 100) score = 100;
  let verdict = 'clean', action = 'allow';
  if (score >= 50) { verdict = 'dangerous'; action = 'block'; }
  else if (score >= 25) { verdict = 'suspicious'; action = 'review'; }
  return { file, score, verdict, action, findings, attribution: attribute(findings) };
}

function scanFile(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    return { file, error: `cannot read: ${e.message}`, score: 0, verdict: 'error', action: 'review', findings: [] };
  }
  // v1.2 fix: binary files (images, fonts, archives) read as text look
  // like one giant "line" and false-positive T02. A null byte in the
  // first 8 KB means binary — skip it. Fake .woff2/.svg files carrying
  // JS are text, so they still get scanned.
  if (buf.slice(0, 8192).includes(0)) {
    return { file, score: 0, verdict: 'clean', action: 'allow', findings: [], skipped: 'binary' };
  }
  return scanContent(file, buf.toString('utf8'));
}

function collectFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules' && entry.name !== '.git') walk(p); }
      else out.push(p);
    }
  };
  walk(target);
  return out.sort();
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--json');
  const asJson = process.argv.includes('--json');
  const target = args[0];
  if (!target) {
    console.error('Usage: node scanner.js <file-or-dir> [--json]');
    process.exit(2);
  }
  const files = collectFiles(target);
  const results = files.map(scanFile);
  if (asJson) {
    console.log(JSON.stringify({ scanned: files.length, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.verdict.toUpperCase()} ${r.score}  ${r.file}`);
      for (const f of r.findings) console.log(`  +${f.weight} ${f.trait} ${f.name} (${f.confidence}): ${f.detail}`);
      if (!r.findings.length) console.log('  no traits found');
    }
  }
  const worst = Math.max(0, ...results.map((r) => r.score));
  process.exit(worst >= 50 ? 2 : worst >= 25 ? 1 : 0);
}
if (require.main === module) main();
module.exports = { scanContent, scanFile, attribute, RULES };
