// Scanner V1 HTTP server — mirrors Website Watcher src/server.js in shape.
// POST /v1/malware/scan       { filename, content } -> agent-format JSON
// POST /v1/malware/scan-batch { files: [{ filename, content }] } -> batch JSON
// POST /v1/malware/scan-repo  { repoUrl } -> repo agent-format JSON
// GET  /v1/malware/health     -> { ok, engine, version }
// Static only: content is read as text and scanned, never executed,
// required, imported, or evaled.
//
// NO-STORAGE RULE (the product's core promise): other users' files are
// never stored on this VPS.
//  - File scan: scanned in memory via scanContent(), never written to disk.
//  - Repo scan: cloned into a temp dir, scanned, deleted in a finally
//    block (even on error/timeout), and the deletion is verified.
//    Only public GitHub repos are accepted — no tokens, no private repos.
//  - Logs/answers carry verdicts, scores, and trait IDs only, never
//    file contents.
// Pricing (deploy-time, via the Liquid Agent x402 middleware, same as
// Website Watcher): $0.05 per scan, payTo the Liquid treasury
// 0x7475e9e0ee7c0d9f1abcaffb74f5f4e195ef3703, Base + Arc.
// This file runs in DEMO mode by default (no payment gate) so it can be
// tested locally. Set SCANNER_REQUIRE_PAYMENT=1 on the Liquid VPS and
// wire it behind the existing x402 middleware before going live.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { agentFormat, repoFormat, batchFormat } = require('./agent.js');
const { scanContent: scanText } = require('./scanner.js');

const PORT = process.env.PORT || 8082;
const VERSION = '1.3.2';
const MAX_BODY = 2 * 1024 * 1024;
const MAX_BATCH_BODY = 10 * 1024 * 1024;
const MAX_BATCH_FILES = 100;
const MAX_BATCH_FILE_BYTES = 2 * 1024 * 1024;
const CLONE_TIMEOUT_MS = 120000;
const SCAN_TIMEOUT_MS = 120000;
const MAX_REPO_BYTES = 500 * 1024 * 1024;
const MAX_HISTORY_COMMITS = 1000;
const MAX_CONCURRENT_REPO_SCANS = 2;

let repoScansRunning = 0;

// Public GitHub repos only. Accepts https://github.com/owner/repo,
// with optional .git suffix and trailing slash. Rejects anything with
// userinfo (credentials in the URL), any other host, any other scheme.
// file:// is accepted ONLY when SCANNER_ALLOW_LOCAL_REPOS=1 (local
// testing with synthetic repos; off by default, never on in production).
function isAllowedRepoUrl(raw) {
  if (typeof raw !== 'string' || !raw.length) return false;
  if (process.env.SCANNER_ALLOW_LOCAL_REPOS === '1' && raw.startsWith('file://')) {
    return raw.length > 7 && !raw.includes('..');
  }
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com') return false;
  if (u.username || u.password) return false;
  const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (parts.length !== 2) return false;
  const ok = /^[A-Za-z0-9_.-]+$/;
  if (!ok.test(parts[0]) || !ok.test(parts[1].replace(/\.git$/, ''))) return false;
  return true;
}

function execFileAsync(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: SCAN_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024, ...(opts || {}) }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(err);
      resolve({ stdout: stdout || '', stderr: stderr || '', code: err ? err.code : 0 });
    });
  });
}

function dirSizeBytes(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return total;
}

async function scanRepo(repoUrl) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-repo-'));
  try {
    await execFileAsync('git', ['clone', '--quiet', repoUrl, tmp], { timeout: CLONE_TIMEOUT_MS });
    if (dirSizeBytes(tmp) > MAX_REPO_BYTES) {
      const e = new Error('repo too large (over 500 MB)');
      e.statusCode = 413;
      throw e;
    }
    const treeOut = await execFileAsync(process.execPath, [path.join(__dirname, 'scanner.js'), tmp, '--json']);
    const tree = JSON.parse(treeOut.stdout);
    // Never leak the temp dir path in the answer: report repo-relative paths.
    for (const r of tree.results || []) r.file = path.relative(tmp, r.file);
    const histOut = await execFileAsync(process.execPath, [path.join(__dirname, 'scan-history.js'), tmp, '--json', '--max-commits', String(MAX_HISTORY_COMMITS)]);
    const history = JSON.parse(histOut.stdout);
    return repoFormat({ repoUrl, tree, history });
  } finally {
    // Always delete the clone, even on error or timeout, and verify it is gone.
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    if (fs.existsSync(tmp)) {
      console.error(`scan-repo: FAILED to delete temp clone ${tmp}`);
    }
  }
}

function readBody(req, res, cb, maxBytes) {
  const limit = maxBytes || MAX_BODY;
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > limit) req.destroy(); });
  req.on('end', () => {
    let input;
    try { input = JSON.parse(body); } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid JSON' })); return; }
    cb(input);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Split-setup auth (Nov 18, 2026): this service runs on the isolated study
  // VPS. The Liquid VPS fronts it and forwards only paid requests with the
  // shared secret. Direct calls without it are refused. Unset secret = open
  // (local testing only, never in production).
  if (process.env.SCANNER_SECRET && req.headers['x-scanner-secret'] !== process.env.SCANNER_SECRET) {
    res.statusCode = 401; res.end(JSON.stringify({ error: 'unauthorized' })); return;
  }
  if (req.method === 'GET' && req.url === '/v1/malware/health') {
    res.end(JSON.stringify({ ok: true, engine: 'polinrider-scanner', version: VERSION, priceUsd: 0.05, demo: process.env.SCANNER_REQUIRE_PAYMENT !== '1' }));
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/malware/scan') {
    readBody(req, res, (input) => {
      if (!input || typeof input.content !== 'string' || !input.content.length) {
        res.statusCode = 400; res.end(JSON.stringify({ error: 'content (string) is required' })); return;
      }
      if (process.env.SCANNER_REQUIRE_PAYMENT === '1') {
        res.statusCode = 402; res.end(JSON.stringify({ error: 'payment required — wire behind the Liquid Agent x402 middleware (see PRODUCT.md)' })); return;
      }
      // In-memory scan: the submitted text never touches disk.
      const result = scanText(input.filename || 'file.txt', input.content);
      res.end(JSON.stringify(agentFormat(result)));
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/malware/scan-batch') {
    readBody(req, res, (input) => {
      if (!input || !Array.isArray(input.files) || !input.files.length) {
        res.statusCode = 400; res.end(JSON.stringify({ error: 'files (array of { filename, content }) is required' })); return;
      }
      if (input.files.length > MAX_BATCH_FILES) {
        res.statusCode = 400; res.end(JSON.stringify({ error: `at most ${MAX_BATCH_FILES} files per batch` })); return;
      }
      for (const f of input.files) {
        if (!f || typeof f.filename !== 'string' || typeof f.content !== 'string' || !f.content.length) {
          res.statusCode = 400; res.end(JSON.stringify({ error: 'every file needs a filename and non-empty content' })); return;
        }
        if (Buffer.byteLength(f.content, 'utf8') > MAX_BATCH_FILE_BYTES) {
          res.statusCode = 400; res.end(JSON.stringify({ error: `file ${f.filename} is over the 2 MB per-file limit` })); return;
        }
      }
      if (process.env.SCANNER_REQUIRE_PAYMENT === '1') {
        res.statusCode = 402; res.end(JSON.stringify({ error: 'payment required — wire behind the Liquid Agent x402 middleware (see PRODUCT.md)' })); return;
      }
      // In-memory batch scan: nothing is written to disk, nothing stored.
      const results = input.files.map((f) => scanText(f.filename, f.content));
      res.end(JSON.stringify(batchFormat(input.files, results)));
    }, MAX_BATCH_BODY);
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/malware/scan-repo') {
    readBody(req, res, (input) => {
      if (!input || typeof input.repoUrl !== 'string' || !isAllowedRepoUrl(input.repoUrl)) {
        res.statusCode = 400; res.end(JSON.stringify({ error: 'repoUrl must be a public https://github.com/owner/repo URL' })); return;
      }
      if (process.env.SCANNER_REQUIRE_PAYMENT === '1') {
        res.statusCode = 402; res.end(JSON.stringify({ error: 'payment required — wire behind the Liquid Agent x402 middleware (see PRODUCT.md)' })); return;
      }
      if (repoScansRunning >= MAX_CONCURRENT_REPO_SCANS) {
        res.statusCode = 429; res.end(JSON.stringify({ error: 'too many repo scans running, try again shortly' })); return;
      }
      repoScansRunning++;
      scanRepo(input.repoUrl).then((result) => {
        repoScansRunning--;
        res.end(JSON.stringify(result));
      }).catch((err) => {
        repoScansRunning--;
        res.statusCode = err.statusCode || 500;
        res.end(JSON.stringify({ error: String(err.message || err) }));
      });
    });
    return;
  }
  res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' }));
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`scanner v${VERSION} listening on :${PORT} (demo=${process.env.SCANNER_REQUIRE_PAYMENT !== '1'})`));
}
module.exports = { server, scanRepo, isAllowedRepoUrl };
