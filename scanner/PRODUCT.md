# Malware Scanner V1 — Liquid Agent Security

PolinRider / Contagious Interview file scanner. Static text analysis
only — scanned files are never executed, required, imported, or evaled.

## What V1 includes

- `scanner.js` (v1.3.2) — the engine. `node scanner.js <file-or-dir> [--json]`.
  Exit 0 allow, 1 review, 2 block. Scores 0–24 allow, 25–49 review, 50+ block.
  v1.2.1 adds T24/T25 package.json install hooks: a risky hook
  (curl|sh, node -e, PowerShell download, base64 decode, eval) blocks
  at 55; a benign hook is 15 (signal only); a benign prepare is 0.
  v1.3.0 adds Shai-Hulud rules T26–T38 + family-first attribution.
  v1.3.1 fixes the T01 false positive: T01 fires only on config
  filenames (never test files, never .md/docs) and only when the
  code after the export is blob-shaped. Clean corpus (45,284 files
  across next.js, vite, tailwind, react): 0.54% review, 0.013% block.
  v1.3.2 applies the Nov 9 trait-calibration fixes (measured on
  55,171 clean files vs the malicious corpora): T02 weight 25 -> 20,
  T38 weight 25 -> 20, T30 weight 40 -> 50, and the T04
  global-require branch now matches nested brackets
  (`global[_$_3035[0]]= require`). See test-results-2026-11-08.md
  for the v1.3.2 re-verification numbers.
- `scan-history.js` (v1.2) — git history scan. `node scan-history.js <repo-dir>`.
  Read-only git, blob-deduped; catches malware that HEAD was cleaned of
  but history still holds (the BlackChain case).
- `clone-scan.sh` (v1.2) — clone-level scan. `./clone-scan.sh <repo-url> [dest]`.
  Clones, scans working tree + history, prints BLOCK/REVIEW/CLEAN before
  anything is installed. Never runs `npm install` or any repo code.
- `agent.js` — agent-format output, mirroring Website Watcher
  (`verdict, score, confidence, action, summary, topFindings, categories, facts, details`).
- `server.js` — HTTP endpoint. `POST /v1/malware/scan { filename, content }`
  (scanned in memory, never written to disk), `POST /v1/malware/scan-batch
  { files: [{ filename, content }] }` (up to 100 files, 2 MB each, 10 MB
  total, one folder verdict, in memory, nothing stored), `POST
  /v1/malware/scan-repo { repoUrl }` (public GitHub only — clones to a temp
  dir, scans tree + history, deletes the clone, always, even on error),
  `GET /v1/malware/health`. Tested locally: clean file 0/allow,
  malicious-shaped file 80/block, clean batch 0/allow, mixed batch 80/block
  naming the flagged file, history-infected repo 80/block, clean repo
  0/allow, real public repo (LeftyChris13/cv) 0/allow. Validation rejects
  non-GitHub hosts and URLs carrying credentials (400); file:// only with
  the test-only `SCANNER_ALLOW_LOCAL_REPOS=1` flag.
- `mcp-tool.json` — MCP tool specs (`malware_scan`, `malware_scan_batch`,
  `malware_scan_repo`).
- `github-action/action.yml` — GitHub Action that runs the scanner on a path.
- `test/` — clean (4 files, all 0) and malicious-shaped synthetic fixtures.
- `test-results-2026-11-08.md` — full test runs, including the real sample.

## Pricing

- x402 per-scan: **$0.05**, Base + Arc, payTo Liquid treasury
  `0x7475e9e0ee7c0d9f1abcaffb74f5f4e195ef3703` (same treasury as Website Watcher).
- B2B / B2B2A pricing: see `../b2b2a-pricing-plan-2026-11-08.md`.
- Demo mode: `server.js` runs without a payment gate by default so it
  can be tested. Set `SCANNER_REQUIRE_PAYMENT=1` and wire it behind
  the Liquid Agent x402 middleware before going live (same pattern as
  Website Watcher `/v1/link/check/agent`).

## Measured results (Nov 8, 2026, study VPS, real BlackChain sample)

- ed-Frontend postcss: 100 block, PolinRider high; trading-engine postcss: 100 block, PolinRider high
- ed-Frontend eslint: 90 block, PolinRider medium; trading-engine eslint: 90 block, PolinRider medium
- npm_cli.js: 85 block, PolinRider medium; origin-main postcss: 100 block, PolinRider medium (marker is 7-li2004, a rotated variant, not 7-d37 — shape carries it); origin-main eslint: 90 block, PolinRider medium
- 7 of 7 real trojanized files block. Clean sets: 0 false positives.
- Attribution: every answer names the family with a confidence tier
  (see README). Real manifests on the study VPS: fake Rabby 80 block,
  PolinRider high; trojanized MetaMask + Phantom manifests 30 review
  each, PolinRider medium (manifest marker alone is a hunt lead, not
  a block — the trojanization is manifest-level, the JS files are
  mostly legitimate wallet copies).

## No-storage rule (the product's core promise)

- Other users' files are never stored on the Liquid VPS. File scans run
  in memory; repo clones live only in a temp dir and are deleted in a
  `finally` block, verified gone after every scan. No database of scanned
  files; logs carry verdicts, scores, and trait IDs only, never file contents.
- Public repos only via the API — no tokens, no private repos. Private
  repos are scanned locally (CLI / clone-scan.sh / GitHub Action).
- Guards: repo clone timeout 120s, scan timeout 120s, max repo 500 MB,
  history capped at 1000 commits (reported in the answer), max 2
  concurrent repo scans (429 beyond that).

## Limits (honest)

- File-scope traits only. Behavioural detection (detached node -e,
  blockchain dead-drop at runtime, BeaverTail/InvisibleFerret
  persistence) belongs in the computer watcher, not this file scanner.
- Measured only against this one family sample + synthetics. The 8/10
  coverage is a trait estimate, not a measured rate across all variants.
- The scanner's detection method (exact markers, obfuscator names) is
  NOT in the shareable one-pager — that stays private to the engine.

## Later: zip upload (premium)

Christopher, Nov 8, 2026: zip upload is a later feature and should
DEFINITELY cost more than the $0.05 scans — exact price TBD. Unzipping
other people's archives needs extra guarding (zip bombs, path
traversal, symlinks), which is why it is later, not now. The batch
endpoint covers the same folder use case without any archive handling.

## Deploy (Liquid VPS, when ready)

1. Copy `scanner-engine-v1/` to the Liquid Agent VPS.
2. Wire `server.js` behind the existing x402 middleware (Watcher pattern),
   price $0.05, payTo the treasury above.
3. Add the MCP tool from `mcp-tool.json` (paidCall, same as Watcher's `link_check`).
4. Smoke-test with a clean file (expect 0/allow) and a malicious-shaped
   file (expect 80/block) before announcing it.
