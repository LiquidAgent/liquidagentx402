# Scanner engine v1.3.2 — PolinRider / Contagious Interview

Engine v1.3.2 (Nov 9, 2026): trait-calibration fixes from the Nov 9
per-trait analysis (55,171 clean files vs the malicious corpora) —
T02 weight 25 -> 20, T38 weight 25 -> 20, T30 weight 40 -> 50, and
the T04 global-require branch now matches nested brackets
(`global[_$_3035[0]]= require`). `scanContent()` is exported for
reuse. Clone-level scan — `scan-history.js` scans every version of
the config files in a repo's git history (blob-deduped, read-only
git), and `clone-scan.sh` clones a repo then scans the working tree
+ history before anything is installed or run. Real-sample test
Nov 8: 7 of 7 BlackChain trojanized files block (postcss 100, eslint
90, npm_cli 85), clean sets 0 false positives. See
test-results-2026-11-08.md for the full run (v1.3.2 re-verification
in the v1.3.2 section at the end).

Static text analysis only. Never executes, requires, imports, or evals
the scanned file. It reads the file as text and checks it against the
traits in `../malware-family-traits-2026-11-08.md` (v1 + v2).

## Use

```
node scanner.js <file-or-dir> [--json]
node scan-history.js <repo-dir> [--json] [--max-commits N]
./clone-scan.sh <repo-url> [dest-dir]
PORT=8082 node server.js   # POST /v1/malware/scan, POST /v1/malware/scan-repo
```

Binary files are skipped (null byte in the first 8 KB), so images and
fonts do not false-positive T02; T02 also does not fire on `.min.js`
or `.map` files. Fake `.woff2`/`.svg` files carrying JS are text, so
they are still scanned (T17).

Exit 0 = clean / allow, 1 = suspicious / review, 2 = dangerous / block.
JSON output with `--json` has `{ scanned, results: [{ file, score,
verdict, action, findings: [{ trait, name, confidence, weight, detail }] }] }`.

`scanner.js` scans the working tree only and skips `.git` — a repo
whose HEAD was cleaned will scan clean even though the malware is
still in history. `scan-history.js` closes that gap: it reads every
commit's config files with `git ls-tree` + `git cat-file` (read-only,
never checks out, never executes repo code) and reports each flagged
blob with the commits and paths it appeared in. `clone-scan.sh` does
both right after `git clone`, before `npm install`, and prints a
final BLOCK / REVIEW / CLEAN verdict.

## Family attribution (v1.2)

Every scan result carries `attribution: { family, confidence, campaign,
basis }`, and the agent-format answers carry it as `malware`. The
summary names the family: "likely infected with PolinRider
(Contagious Interview campaign)" at high confidence, "consistent with
PolinRider" at medium. Tiers: confirmed marker (T03 7-d37, T11 v1,
T12 v2, T08 fake Rabby) = PolinRider high; loader shape without a
marker (T01 + blob/decoder/eval), trojanized npm CLI (T10 + blob/eval),
or manifest marker (T09-case) = PolinRider medium; second-stage
traits (T19-T23) = BeaverTail / InvisibleFerret medium; anything else
= Unknown, no family named. Static traits alone are never asserted
as 100% certain.

## Scoring (v2)

- 0-24 allow, 25-49 review, 50+ block.
- Code after a config export alone: 40. With a long blob: 50+.
- Any confirmed marker (7-d37, rmcej%otb%, Cot%3t): 40 on its own.
- Require smuggling + eval together: 35.
- tasks.json folderOpen executing a woff2/svg: 40.
- Fake Rabby extension ID: 50.
- package.json install hooks (v1.2.1): a risky hook — curl/wget piped
  to a shell, `node -e`, PowerShell download/execute, certutil,
  base64 decode, eval — scores 40 (T24) plus 15 for the hook itself
  (T25), so 55 block on its own. Any preinstall/install/postinstall
  hook scores 15 (T25, signal only, never changes a verdict alone).
  A benign `prepare` (npm run build, simple-git-hooks) scores 0.

## Scope and limits

- File-scope traits only (config, tasks.json, manifest.json, npm_cli.js,
  woff2/svg). Behavioural traits (detached node -e, blockchain RPC then
  plain HTTP, BeaverTail / InvisibleFerret persistence and exfil) are
  implemented only where they leave a string in a file. Full behavioural
  detection belongs in the computer watcher, not this file scanner.
- Trait 9 correction: wallet-extension manifest `__meta` + `7-d37` is a
  case-specific hunt lead (weight 20), not an established family trait.
  Public reports verify trojanized extension installs + Chrome MV2
  downgrade instead.
- Test fixtures under `test/` are minimal synthetic trait triggers,
  labelled as such. They prove the rules fire and clean files do not.
  They are NOT real malware and NOT variants. Validation against the
  real sample was done Nov 8, 2026 on the isolated study VPS (7 of 7
  BlackChain files block, see test-results-2026-11-08.md). The
  reassessed 8/10 coverage remains a trait-coverage estimate, not a
  measured detection rate across all variants — the engine has only
  been measured against this one family sample plus synthetics.
