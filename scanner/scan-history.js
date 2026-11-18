#!/usr/bin/env node
// Liquid Agent malware scanner — git history scan (v1.2, Nov 8, 2026).
// Scans every version of the interesting files in a repo's git history,
// not just HEAD. This is the BlackChain lesson: HEAD was cleaned Nov 2,
// but the trojanized configs were still in history at a271a88 / 1f6a056,
// and a clone brings the whole history with it.
//
// Read-only git only: rev-list, ls-tree, cat-file. Never checks out,
// never resets, never executes anything from the repo. Blob-deduped:
// the same file content (same git blob) is scanned once, no matter how
// many commits contain it, and each flagged blob lists every commit
// and path it appeared in.
//
// Usage: node scan-history.js <repo-dir> [--json] [--max-commits N]
// Exit 0 = clean/allow, 1 = review, 2 = block (same bands as scanner.js).
const { execSync } = require('child_process');
const path = require('path');
const { scanContent } = require('./scanner.js');

// Files the PolinRider / Contagious Interview family hides in.
function isInteresting(p) {
  const base = path.basename(p);
  if (/^(eslint|postcss|tailwind|next|vite|astro|webpack|metro)\.config\./.test(base)) return true;
  if (base === 'server.js' || base === 'App.js') return true;
  if (base === 'package.json') return true;
  // Pack 2 (v1.3): worm loader / persistence files.
  if (['bundle.js', 'setup_bun.js', 'bun_environment.js', 'setup.mjs', 'binding.gyp', 'shai-hulud-workflow.yml', 'discussion.yaml'].includes(base)) return true;
  if (base === 'tasks.json' && p.includes('.vscode')) return true;
  if (base.startsWith('npm_cli.js')) return true;
  if (base.endsWith('.woff2') || base.endsWith('.svg')) return true;
  return false;
}

function git(repo, args) {
  return execSync(`git ${args}`, { cwd: repo, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const maxIdx = argv.indexOf('--max-commits');
  const maxCommits = maxIdx >= 0 ? parseInt(argv[maxIdx + 1], 10) : 0;
  const maxVal = maxIdx >= 0 ? argv[maxIdx + 1] : null;
  const repo = argv.find((a) => !a.startsWith('--') && a !== maxVal);
  if (!repo) {
    console.error('Usage: node scan-history.js <repo-dir> [--json] [--max-commits N]');
    process.exit(2);
  }
  let gitDir;
  try {
    gitDir = git(repo, 'rev-parse --git-dir').trim();
  } catch (e) {
    console.error(`Not a git repo: ${repo}`);
    process.exit(2);
  }
  void gitDir;

  let commits = [];
  try {
    const out = git(repo, 'rev-list --all').trim();
    commits = out ? out.split('\n') : [];
  } catch (e) {
    console.log('CLEAN 0  no commits in history');
    process.exit(0);
  }
  if (maxCommits > 0) commits = commits.slice(0, maxCommits);

  // blob oid -> { paths: Set, commits: Set }
  const blobs = new Map();
  for (const commit of commits) {
    let tree;
    try { tree = git(repo, `ls-tree -r ${commit}`); } catch { continue; }
    for (const line of tree.split('\n')) {
      if (!line) continue;
      // "<mode> blob <oid>\t<path>"
      const m = line.match(/^\S+ blob ([0-9a-f]{40})\t(.+)$/);
      if (!m) continue;
      const [, oid, filePath] = m;
      if (!isInteresting(filePath)) continue;
      if (!blobs.has(oid)) blobs.set(oid, { paths: new Set(), commits: new Set() });
      blobs.get(oid).paths.add(filePath);
      blobs.get(oid).commits.add(commit);
    }
  }

  const flagged = [];
  let scanned = 0;
  for (const [oid, info] of blobs) {
    let content;
    try {
      content = execSync(`git cat-file blob ${oid}`, { cwd: repo, maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
    } catch { continue; }
    scanned++;
    const label = [...info.paths].sort()[0];
    const result = scanContent(label, content);
    if (result.findings.length) {
      flagged.push({
        oid, score: result.score, verdict: result.verdict, action: result.action,
        findings: result.findings,
        paths: [...info.paths].sort(),
        commits: [...info.commits].sort(),
      });
    }
  }

  flagged.sort((a, b) => b.score - a.score);
  const worst = flagged.length ? Math.max(...flagged.map((f) => f.score)) : 0;

  if (asJson) {
    console.log(JSON.stringify({
      repo, commitsScanned: commits.length, blobsScanned: scanned,
      flaggedBlobs: flagged.length, worstScore: worst,
      flagged: flagged.map((f) => ({
        ...f, commits: f.commits.map((c) => c.slice(0, 7)),
      })),
    }, null, 2));
  } else {
    console.log(`History scan: ${commits.length} commits, ${scanned} unique config blobs scanned, ${flagged.length} flagged`);
    for (const f of flagged) {
      console.log(`${f.verdict.toUpperCase()} ${f.score}  blob ${oidShort(f.oid)}  ${f.paths.join(', ')}`);
      for (const t of f.findings) console.log(`  +${t.weight} ${t.trait} ${t.name} (${t.confidence}): ${t.detail}`);
      const shorts = f.commits.slice(0, 5).map((c) => c.slice(0, 7));
      console.log(`  in ${f.commits.length} commit(s): ${shorts.join(', ')}${f.commits.length > 5 ? ` +${f.commits.length - 5} more` : ''}`);
    }
    if (!flagged.length) console.log('  no traits found in any history version');
  }
  process.exit(worst >= 50 ? 2 : worst >= 25 ? 1 : 0);
}

function oidShort(oid) { return oid.slice(0, 7); }

main();
