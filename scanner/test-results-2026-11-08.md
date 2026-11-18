# Engine v1 test results — Nov 8, 2026

Command: `node scanner.js test/clean` and `node scanner.js test/malicious-shaped`
Fixtures are minimal synthetic trait triggers, labelled as such. Not real
malware, not variants, not validation against the real sample.

## Clean (4 files) — 0 false positives after T01 fix

- test/clean/eslint.config.mjs: 0 clean / allow
- test/clean/postcss.config.mjs: 0 clean / allow
- test/clean/tailwind.config.js: 0 clean / allow
- test/clean/tasks.json: 0 clean / allow

Note: first run flagged clean tailwind.config.js at 40 (T01 false
positive). Root cause: T01 matched `module.exports =` and treated the
export object itself as code after the export. Fixed with string-aware
brace matching to find the matching close of the export value, then
only flag code after that close. Re-ran clean: 0/4.

## Malicious-shaped synthetic (4 files) — all flagged

- config-after-export.mjs: 85 dangerous / block (T01 40 + T02 25 + T07 20)
- marker-v1.mjs: 100 dangerous / block (T01 40 + T11 40 + T05 20)
- npm_cli.js: 50 dangerous / block (T07 20 + T10 30)
- tasks.json: 40 suspicious / review (T16 40)

## Reassessed coverage

- Main PolinRider: 8/10
- Variants: 8/10
- Basis: v2 traits (26 traits, 12 marker-independent in the public
  research page), engine v1 implementing the file-scope subset, clean
  0/4 false positives on this small clean set.
- Not a measured detection rate. Remaining gap to 9-10 is the blocked
  ground-truth validation against the real sample, plus the user's
  manual VPS read of full npm_cli.js and the fake-extension tar.

## Real BlackChain sample — Nov 8, 2026 ~15:00 EST (hazmat test)

Method: scanner.js (v1, unchanged) copied to the isolated study VPS
(the study VPS, node 18.19.1 installed there for this test only),
run there against the evidence .txt files in
/root/malware-study/blackchain-malware-evidence/. Nothing executed,
nothing copied to the Muse VM. The file Christopher pasted from
GitHub (ed-Frontend postcss.config.mjs at a271a88) matches the
evidence file tested: same marker global.o='7-d3715', same
deobfuscator _$_3035, same seed 3309392, same longest line 5451,
709 consecutive spaces.

- ed-Frontend postcss.config.mjs: 100 dangerous / block
  (T02 25 + T15 15 + T03 40 + T04 20 + T05 20 = 120, capped 100)
- trading-engine-frontend postcss.config.mjs: 100 dangerous / block
  (same traits as above)
- trading-engine-frontend eslint.config.js: 85 dangerous / block
  (T01 40 + T02 25 + T06 20)
- npm_cli.js.txt: 60 dangerous / block (T02 25 + T15 15 + T07 20)
- ed-Frontend origin-main postcss.config.mjs: 80 dangerous / block
  (T02 25 + T15 15 + T04 20 + T05 20; different marker variant, _$_69)
- ed-Frontend eslint.config.mjs: 45 suspicious / review ONLY
  (T02 25 + T06 20) — MISSES the 50 block threshold
- ed-Frontend origin-main eslint.config.mjs: 45 suspicious / review ONLY
  (same traits)

Result: 4 of 6 real trojanized files blocked, 2 of 6 only reviewed.
Weak spot is the eslint .mjs hex-decoder variant: it triggers only
T02 (long line) + T06 (base64 decoder). Gaps found in this test:
- T01 missed the postcss files: they use `export default config;`
  (identifier export), and T01 returns null on `;` before any `{`.
  It fired only on trading-engine eslint. Fix: handle identifier
  exports in T01.
- T10 did not fire on npm_cli.js.txt: it checks basename exactly
  `npm_cli.js`, the evidence file is `npm_cli.js.txt`. Fix: match
  basename starting with npm_cli.js.
- T06 alone (+20) is not enough to push the eslint variant over 50
  with only T02. Fix candidate: add a rule for the c(b,d) decoder
  call itself, or raise T06, or score long-blob + decoder together.

Reassessed coverage after this real-sample test: still 8/10 main /
8/10 variants as a trait estimate, but now with a measured weak
spot — the eslint hex-decoder variant is review-only in v1, not
blocked. That is the next engine fix before shipping.

## Engine v1.1 — Nov 8, 2026 ~15:10 EST (fixes + re-test)

Fixes in scanner.js (v1.1):
- T01 now handles `export default config;` identifier exports.
- T06 hex-offset decoder weight 20 -> 30.
- T10 matches npm_cli.js.txt evidence copies too.

Clean re-test (VM): 4/4 still 0, clean / allow. No regression.
Synthetic malicious re-test (VM): 85, 100, 50, 40 — all still flagged.
Clean control on study VPS: 0, clean / allow.

Real BlackChain sample re-test (study VPS, v1.1):
- ed-Frontend postcss.config.mjs: 100 dangerous / block
  (T01 40 + T02 25 + T15 15 + T03 40 + T04 20 + T05 20, capped 100)
- ed-Frontend eslint.config.mjs: 95 dangerous / block (was 45)
  (T01 40 + T02 25 + T06 30)
- trading-engine-frontend postcss.config.mjs: 100 dangerous / block
  (marker here is 7-d3716, T03 still catches the 7-d37XX family)
- trading-engine-frontend eslint.config.js: 95 dangerous / block (was 85)
- npm_cli.js.txt: 90 dangerous / block (was 60, T10 now fires +30)
- ed-Frontend origin-main postcss.config.mjs: 100 dangerous / block (was 80)
  (marker here is 7-li2004, T03 does not fire, still 100 via T01+T02+T15+T04+T05)
- ed-Frontend origin-main eslint.config.mjs: 95 dangerous / block (was 45)

Result: 7 of 7 real trojanized files now block. No clean false
positives in the clean sets tested. Engine v1.1 is the shipping
engine for V1.

## False-positive test — cleaned HEAD files, Nov 8, 2026 ~15:15 EST

Method: Christopher pasted the current HEAD (Nov 2 cleaned) files
as text; scanned on the VM with v1.1, temp file deleted after.
- ed-Frontend postcss.config.mjs at HEAD: CLEAN 20, allow, exit 0
  (T04 +20 createRequire only — the legit config uses createRequire,
  exactly as predicted. Trojanized version of the same file: 100 block.)
  Same file, malware stripped, score drops 100 -> 20. No false positive.
- ed-Frontend eslint.config.mjs at HEAD: CLEAN 0, allow, exit 0
  (no traits found). Trojanized version of the same file: 95 block
  under v1.1. Pair complete: infected 95 -> cleaned 0. No false positive.
- trading-engine-frontend postcss.config.mjs at HEAD (tested Nov 8
  ~16:01 EST, pasted by Christopher): CLEAN 20, allow (T04 createRequire
  only, attribution Unknown). Trojanized version: 100 block. Pair
  complete: infected 100 -> cleaned 20.
- trading-engine-frontend eslint.config.js at HEAD (tested Nov 8
  ~16:02 EST, pasted by Christopher): CLEAN 0, allow, no traits found.
  Trojanized version: 95 block. Pair complete: infected 95 -> cleaned 0.

All four BlackChain false-positive pairs are now complete:
- ed-Frontend postcss: infected 100 block -> cleaned 20 allow
- ed-Frontend eslint: infected 95 block -> cleaned 0 allow
- trading-engine-frontend postcss: infected 100 block -> cleaned 20 allow
- trading-engine-frontend eslint: infected 95 block -> cleaned 0 allow
No false positives in any of the four real cleaned files.

## Shai-Hulud ground-truth baseline — Nov 8, 2026 ~16:15 EST

First real ground-truth test against known-malicious packages from
public advisories (StepSecurity / OX / Socket lists). Method: npm
registry tarballs, jsDelivr fallback for individual payload files,
all on the study VPS at /root/ground-truth/shai-hulud/, static text
scan only, nothing executed or installed. Corpus RETAINED there for
the pack-2 re-test.

16 candidates tried: @ctrl/tinycolor 4.1.1/4.1.2, @ctrl/deluge 7.2.2,
angulartics2 14.1.2, @ctrl/magnet-link 4.0.4, @ctrl/torrent-file 4.1.2,
ngx-color 10.0.2, rxnt-authentication 0.0.3, posthog-js 1.297.3,
mbt 1.2.48, @cap-js/db-service 2.10.1, @cap-js/postgres 2.2.2,
@cap-js/sqlite 2.2.2, keyv 6.0.0, flat-cache 6.1.24,
file-entry-cache 11.1.6.
- 12 of 16 UNAVAILABLE: tarballs removed from npm, jsDelivr also
  purged. Expected — malicious versions get pulled fast.
- 4 retrievable via jsDelivr payload files only:
  - keyv@6.0.0 setup.mjs: 55 BLOCK (T02 long line + T06 hex decoder).
  - file-entry-cache@11.1.6 setup.mjs: 55 BLOCK (same loader,
    identical 29,918-byte file).
  - posthog-js@1.297.3 bun_environment.js (10 MB): 45 REVIEW
    (T02 + T07 eval) — 5 points under block.
  - mbt@1.2.48: only package.json retrievable (setup.mjs not
    served), 15 ALLOW (T25 only) — payload untestable, NOT a
    scanner miss on a payload file.
  - All four package.json files: 15 ALLOW (T25 install hook only).
Baseline with pack-1 rules (v1.2.1), on the 3 packages with a
retrievable payload: 2 of 3 block, 1 of 3 review — 3 of 3 flagged
suspicious-or-higher, 0 of 3 missed outright. Attribution Unknown
on all (no PolinRider traits — correct, these are a different
family). Pack 2 should push posthog-js over the block line and
name Shai-Hulud.
No node processes left running on the study VPS.

## Shai-Hulud retrieval push — Nov 8, 2026 ~16:20 EST (75%, not 90%)

Christopher: 4 of 16 retrievable is not good enough, needs 90%.
Retried the 12 missing via npmmirror, Huawei, Tencent, Tsinghua,
BFSU, USTC, Aliyun, yarnpkg, esm.sh, skypack, unpkg, Wayback
(tarball URLs and jsDelivr/unpkg file URLs), and a web search for
GitHub sample repos. Huawei's mirror still served 8 full tarballs.
Result: 12 of 16 retrievable (75%), still short of 90% (15 of 16).
The 4 still missing — @ctrl/tinycolor@4.1.1,
@ctrl/torrent-file@4.1.2, rxnt-authentication@0.0.3,
@cap-js/postgres@2.2.2 — are gone from every public source tried.
They are payload-siblings of retrieved packages (same worm bundle
as tinycolor 4.1.2, the other @ctrl v1 packages, and
@cap-js/sqlite 2.2.2 respectively), but sibling equivalence is not
a test — counted as untested, not as passed.

Full baseline on the 12 retrieved, pack-1 rules (v1.2.1):
- BLOCK 100 (T01+T02+T04+T07): @ctrl/tinycolor@4.1.2,
  @ctrl/deluge@7.2.2, @ctrl/magnet-link@4.0.4,
  angulartics2@14.1.2, ngx-color@10.0.2 — all v1 bundle.js.
- BLOCK 55 (T02+T06): keyv@6.0.0, flat-cache@6.1.24,
  file-entry-cache@11.1.6, @cap-js/db-service@2.10.1,
  @cap-js/sqlite@2.2.2 — ChainDrop/Mini setup.mjs loaders.
- REVIEW 45 (T02+T07): posthog-js@1.297.3 bun_environment.js.
- ALLOW 15 (T25 only): mbt@1.2.48, payload file unretrievable.
10 block, 1 review, 1 payload-unavailable. Of the 11 with a
retrievable payload: 10 block, 1 review, 0 missed outright.

ATTRIBUTION ISSUE (found by this test): the five v1 bundle.js
files attribute as PolinRider MEDIUM ("consistent with") — the
generic loader shape (T01+T02+T04+T07) overlaps families, so the
medium tier mislabels a known Shai-Hulud file. Pack 2 must add
Shai-Hulud-specific traits (bundle.js + postinstall, TruffleHog
strings, webhook.site, shai-hulud-workflow.yml, setup_bun.js) so
attribution names the right family. Posthog-js stays Unknown.
Corpus retained at /root/ground-truth/shai-hulud/ on the study VPS.
Paths to close the last 4: MalwareBazaar by bundle.js hash
(needs a free API key), or expand the set with still-live v2 tail
versions from the v2 IOC list (blog.ehsan.it/shai-hulud-v2-ioc.json).

## Clean-corpus false-positive measurement — Nov 8, 2026 ~16:31 EST

20 popular clean public repos attempted (shallow clone, working
tree only, text scan, nothing executed). Engine v1.3.0 (pack-2
rules drafted, unverified). Only 5 cloned — GitHub stopped
serving clones after the first 5 (likely rate limiting from this
IP after heavy cloning); the other 15 (nuxt, prettier, express,
axios, lodash, astro, react-router, material-ui, chakra-ui,
shadcn-ui, TanStack/query, prisma, trpc, eslint, zustand) all
failed to clone and were skipped, not scored.

Results (5 repos, 54,575 files):
- vercel/next.js: 34,508 files, worst 100, 5,901 review (17%),
  79 block. Top: bundled index.js 100 (T01+T02+T07+T38).
- vitejs/vite: 2,913 files, worst 60, 154 review, 1 block.
  vite.config.js itself scores 60 BLOCK (T01+T04) — a legit
  config file, direct false positive.
- tailwindlabs/tailwindcss: 563 files, worst 60, 60 review,
  1 block (wasm.test.ts 60, T01+T04).
- facebook/react: 7,300 files, worst 65, 324 review, 11 block.
- sveltejs/svelte: 9,291 files, worst 40, 27 review, 0 block.
Totals: 6,466 review (11.8% of files), 92 block (0.17%).

ROOT CAUSE — T01 "code after config export" is not scoped to
config files. It fires on ANY file containing `export default`
followed by more code: normal modules, test files, bundled dist
files, and .md docs containing code samples (svelte docs, vite
blog posts). It also fires on legit configs that have code after
the export (vite.config.js). T01 alone is 40 = review, so a
single T01 hit puts a clean file in review; combined with T02/T07
(long line / eval in bundles and tests) it blocks.
FIX REQUIRED before v1 ships: scope T01 to config filenames
only (eslint/postcss/tailwind/next/vite/astro/webpack/metro
configs, server.js, App.js) and never on .md/docs. BlackChain
true positives are all config files, so scoping preserves them;
bundle.js/setup.mjs scores do not depend on T01. Re-run the
corpus after the fix. The 15 skipped repos need a retry with
delays between clones.

## T01 fix v1.3.1 — Nov 8, 2026 ~16:35 EST

Design (from the real FP file, vite playground
optimize-deps/vite.config.js, 60 block): it has 5,593 chars of
readable helper functions after `export default` — size alone
cannot distinguish it from a payload. T01 now has two guards:
(1) config filenames only (basename contains "config", or
server.js/App.js); (2) the trailing code must be blob-shaped —
a line over 1,000 chars, 200+ consecutive spaces, eval/new
Function, a decoder (_$_NNNN, c(b,d), base64+decodeURIComponent),
or a confirmed family marker in the appended code. A marker
appended after a config export stacks T01 (40) on the marker
rule (40) = 80 block; a marker alone elsewhere stays 40 review.
Variant fixtures renamed to config filenames (test/variants/01/
postcss.config.mjs etc.) so they still exercise T01 as
config-shaped files; 10-minified-clean.min.js unchanged.
Variant 02 (marker-removed minimal, single trait only) now
scores 0 — honest: it is not a config blob, just code after an
export. Variant 03 (v2 marker only) scores 80 again via the
marker-in-trailing-code clause.

Regression after the fix (v1.3.1, local):
- vite FP file: 60 block -> 20 allow (T04 only).
- Clean fixtures 4/4 at 0. Malicious-shaped 85/60/50/40
  (marker-v1 100 -> 60, still block; it is not a config name).
- Variants: 8 of 9 block (01 100, 03 80, 04 100, 05 100,
  06 85, 07 65, 08 100, 11 85); 02 clean 0; 09 review 25
  (clean minified control); 10 clean 0. The 8/9 claim holds.
- pkg fixtures unchanged (55/55/15/0/0).

Real-sample re-run on the study VPS (v1.3.1 copied to
/root/scanner.js):
- BlackChain 7/7 unchanged: 100/95/100/95/90/100/95.
- Shai-Hulud ground truth 12/12 BLOCK, all attributed
  Shai-Hulud (high) — this also verifies the pack-2 rules
  (T26-T38) and the attribution precedence against REAL
  files, not synthetic fixtures: v1 bundle.js files 100
  (T27+T29+T31+T32+T34), setup.mjs files 55 -> 95 (T30),
  posthog-js bun_environment.js 45 review -> 100 BLOCK
  (T27+T29+T30+T31+T32+T34), mbt package.json 15 -> 55
  BLOCK on the hook alone (T25+T26 — postinstall runs
  setup.mjs). The earlier attribution bug (v1 bundle.js
  mislabelled PolinRider medium) is FIXED.
- Real manifests unchanged: fake Rabby 80, Phantom 30,
  MetaMask 30. No node processes left running.
- Pack 2 status: rules + attribution now verified against
  the real 12-file corpus. The synthetic-fixture
  verification step remains not done (blocked, Nov 8).

Clean-corpus re-run with v1.3.1 — Nov 8, 2026 ~16:40 EST
(10 repos attempted, 15s delays between clones; only 4
cloned — GitHub rate limiting persisted, svelte/prettier/
express/axios/lodash/astro skipped again):
- vercel/next.js: 34,508 files, review 163 (was 5,901),
  block 6 (was 79). Worst 90: bundled index.js
  (T02+T04+T07+T38 — createRequire + long line + eval +
  OIDC strings in a dist bundle). One T01 hit remained:
  edge-runtime-configurable-guards.test.ts 60 (T01+T07).
- vitejs/vite: 2,913 files, review 48 (was 154), block 0
  (was 1). Remaining reviews are T02-only 25 on .svg
  logo files (long path-data lines).
- tailwindlabs/tailwindcss: 563 files, review 3 (was 60),
  block 0 (was 1). T02-only 25 (.svg, one test file).
- facebook/react: 7,300 files, review 30 (was 324),
  block 0 (was 11). T02-only 25 (CHANGELOG.md, Logo.tsx,
  .md test expectations).
Totals this run: 45,284 files, 244 review (0.54%),
6 block (0.013%) — down from 11.8% / 0.17%.
Remaining residue: the 6 next.js blocks are all bundled
dist files; the review residue is T02-only 25s on .svg /
.md / logo files. Follow-up tuning, not v1 blockers.

T01 test-file exclusion (v1.3.1, same evening): isConfigFile
now returns false for *.test.* / *.spec.* / __tests__ files,
after the corpus showed the next.js test file scoring 60.
Verified on a synthetic same-named file (eval + long line +
code after export): 60 -> 20, while the same content as
vite.config.ts still scores 60 (T01 fires). All local
regressions unchanged after the exclusion, and BlackChain
7/7 re-verified on the study VPS with the final engine
(100/95/100/95/90/100/95). VPS /root/scanner.js is now in
sync with the workspace v1.3.1.

## Clone-level scan v1.2 — Nov 8, 2026 ~15:20 EST

Built because a working-tree-only scan misses the BlackChain case:
HEAD cleaned Nov 2, malware still in history, and a clone brings the
whole history. `scanner.js` refactored to export `scanContent()`
(rules unchanged); regression re-run: clean 4/4 at 0, malicious-shaped
85/100/50/40, real BlackChain 7/7 still block (100, 95, 100, 95, 90,
100, 95) on the study VPS with v1.2 copied to /root/scanner.js.
No node processes left running on the study VPS after the run.

Synthetic repos in /tmp/clone-scan-test (local git, no network, no
real repos cloned):
- repo-a (BlackChain mirror: infected postcss in commit 1, cleaned in
  commit 2, HEAD clean): working tree CLEAN 0/0; history scan finds
  the infected postcss blob at 85 block in commit bcc6986.
- repo-b (clean throughout): working tree 0/0/0, history 0 flagged.
- repo-c (HEAD infected eslint): working tree 100 block, history 100 block.
- clone-scan.sh end-to-end on file:// URLs: repo-a -> VERDICT BLOCK
  (tree clean, history block, do not npm install), exit 2; repo-b ->
  VERDICT CLEAN, exit 0. Wrapper never runs npm install or repo code.

## Scan-repo endpoint v1.2 — Nov 8, 2026 ~15:30 EST

`server.js` v1.2.0: POST /v1/malware/scan-repo { repoUrl }, public
GitHub only (validation rejects other hosts and credential-carrying
URLs, 400), temp clone + tree/history scan + delete in finally,
verified gone after every scan. File scan switched to in-memory
scanContent — no temp file on disk at all. Guards: 120s clone/scan
timeouts, 500 MB repo cap, history capped at 1000 commits, max 2
concurrent repo scans. mcp-tool.json now has malware_scan +
malware_scan_repo, both $0.05.

Local tests (PORT 18083/18084/18085, demo mode, test server stopped
after each run, 0 temp dirs/files left):
- file scan clean postcss: 20 allow (T04 only), in memory.
- scan-repo file:// repo-a: dangerous 85 block, history blob in
  commit bcc6986; repo-b: clean 0. file:// rejected (400) without
  SCANNER_ALLOW_LOCAL_REPOS=1. gitlab.com + credential URL rejected (400).
- Real public repo https://github.com/LeftyChris13/cv via the endpoint:
  FIRST run returned suspicious 25 — FALSE POSITIVE, T02 fired on
  binary JPEGs read as text. Fixed in scanner.js: binary files skipped
  (null byte in first 8 KB), T02 no longer fires on .min.js / .map.
  Re-run: cv clean 0, 51 files, 140 commits, 0 flagged.
- Regression after the fix: clean 4/4 at 0, malicious-shaped 85/100/50/40,
  synthetic repos unchanged, real BlackChain 7/7 still block
  (100, 95, 100, 95, 90, 100, 95) on the study VPS. No node processes
  left running on the study VPS.

## Batch folder scan — Nov 8, 2026 ~15:35 EST

Hero use case (Christopher): devs / vibe-coder agents clone folders
left and right — download a folder of ~50 files, checker goes through
it, safe or not. Built POST /v1/malware/scan-batch { files }:
max 100 files, 2 MB per file, 10 MB total, one folder verdict, all
in memory, nothing stored. $0.05 per batch call.

Local tests (PORT 18086, demo mode, test server stopped after):
- clean batch (4 clean fixtures): 200 clean 0.
- mixed batch (4 clean + malicious-shaped postcss): 200 dangerous 85,
  flaggedFiles ["postcss.config.mjs"].
- empty files array: 400. 101 files: 400.
- 0 temp files left after all tests.
Zip upload is a LATER feature at a premium price (Christopher: should
DEFINITELY cost more than $0.05 — exact price TBD), because unzipping
other people's archives needs zip-bomb / traversal / symlink guarding.

## Variant mutation tests — Nov 8, 2026 ~15:42 EST

Synthetic variants in test/variants/ (built from trait descriptions
only, NOT real malware), one change at a time from the infected shape.
Question under test: does the shape alone still block with the marker
removed? Answer: yes.

- 01 marker-removed, full shape (code after export + long blob + eval
  + createRequire, no marker): 100 BLOCK.
- 02 marker-removed, minimal (only code after export, nothing else):
  40 REVIEW. Single trait alone does not block — that is the
  false-positive guard working, not a gap. Real malware always carries
  blob + eval alongside the code-after-export.
- 03 marker rotated to v2 (Cot%3t=shtP + MDy + global['_V']='8-stN'):
  80 BLOCK.
- 04 marker v1 (rmcej%otb% + _$_1e42) in full shape: 100 BLOCK.
- 05 obfuscator swapped, postcss shape with hex decoder c(b,d): 100 BLOCK.
- 06 obfuscator swapped, eslint shape with char-shuffle _$_3035: 85 BLOCK.
- 07 eval removed (code after export + long blob only): 65 BLOCK.
- 08 blob split into short lines, marker kept: 100 BLOCK
  (T02 gone, marker + T01 + eval carry it).
- 09 clean minified config, one long line, .mjs: 25 REVIEW (T02 only).
  Noisy but correct band — review, not block.
- 10 same clean minified content as .min.js: 0 CLEAN (T02 skips .min.js).
- 11 marker removed AND eval removed: 85 BLOCK.

Verdict: 8 of 9 malicious variants block; the one that does not is the
minimal single-trait case, review by design. No rule fix needed — the
marker-removal gap does not exist for the real shape.

## Family attribution — Nov 8, 2026 ~15:45 EST

`attribute()` added to scanner.js, wired into every scan result as
`attribution: { family, confidence, campaign, basis }`; agent/repo/batch
answers carry it as `malware` and name it in the summary. Tiers:
confirmed marker (T03/T11/T12/T08) = PolinRider high; loader shape
(T01 + blob/decoder/eval), trojanized npm CLI (T10 + blob/eval), or
manifest marker (T09-case) = PolinRider medium; second-stage traits
(T19-T23) = BeaverTail / InvisibleFerret medium; anything else = Unknown.

Measured:
- Real BlackChain 7/7 on study VPS: postcss files PolinRider high
  (T03 marker), eslint + npm_cli PolinRider medium (shape), origin-main
  postcss PolinRider medium — its marker is 7-li2004, a rotated variant
  T03 does not match, and the shape carries it honestly at medium.
- Variants: marker-v1 100 high, v2 80 high, marker-removed full 100
  medium, eval-removed 65 medium, minimal single-trait 40 Unknown.
- Fake Rabby manifest (synthetic): 50 block, PolinRider high.
- MetaMask __meta manifest (synthetic): 20 allow, PolinRider medium.
  (Bug found in testing: attribution checked trait id 'T09' but the
  rule id is 'T09-case' — fixed, re-tested.)

## Real extension manifests — Nov 8, 2026 ~15:48 EST

Safe method: the tar was already extracted on the study VPS at
/root/malware-study/fake-ext/ — nothing new was extracted, nothing
was copied to the Muse VM or the Mac, nothing was executed. The
scanner only read the three manifest.json files (3-4.5 KB JSON) as
text, on the VPS. No manifest contents are repeated here, only
scores/traits/attribution.

- Fake Rabby acmacodkjbdgmoleebolmdjonilkdbch/manifest.json:
  dangerous 80, PolinRider high (T08 fake ID 50 + T09-case 30).
  Note: it fires T09-case too — all three manifests carry the
  __meta + 7-d37 marker, not just MetaMask/Phantom.
- Phantom bfnaelmomeimhlpmgjnjophhpkkoljpa/manifest.json:
  suspicious 30, PolinRider medium (T09-case only).
- MetaMask nkbihfbeogaeaoehlefnkodbefgpgknn/manifest.json:
  suspicious 30, PolinRider medium (T09-case only).

Finding + fix: first run scored the two trojanized manifests 20
CLEAN, which reads wrong for a trojanized manifest. T09-case was
weight 20 by design (hunt lead, not an established trait), but a
manifest carrying a hidden __meta block with the family marker
deserves human review, not a clean pass. Weight raised 20 -> 30,
so it now lands in review (30), still not a block — the manifest
alone does not prove the extension's JS is malicious, and the JS
files here are mostly legitimate wallet copies. Regression after
the fix: clean fixtures 4/4 at 0, malicious-shaped unchanged
(85/100/50/40). No node processes left running on the study VPS.
- Clean files: attribution null. Batch endpoint returns the worst
  file's attribution as the folder's `malware` field.
- Regression: clean 4/4 at 0, malicious-shaped unchanged, variants
  unchanged. No node processes left running on the study VPS.

## package.json install hooks (T24/T25) — Nov 8, 2026 ~15:57 EST

The gap: install scripts scored 0 — the most common npm malware
vector, uncovered. Fix in scanner.js v1.2.1, plus package.json added
to scan-history.js so a malicious package.json removed from HEAD is
still caught in history.

- T24 risky install hook (40): curl/wget piped to shell, node -e,
  PowerShell download/execute, certutil/bitsadmin, base64 decode,
  eval inside preinstall/install/postinstall/prepare.
- T25 install hook present (15): any preinstall/install/postinstall
  hook — signal only, never changes a verdict alone. Benign prepare
  (npm run build, simple-git-hooks) scores 0.
- A risky hook fires both: 55 block on its own. Attribution is
  Unknown (generic supply-chain, no family traits) unless other
  traits in the file name a family.

Synthetic fixtures in test/variants/pkg-*/package.json:
- malicious postinstall (curl|bash): 55 BLOCK, Unknown.
- node -e preinstall: 55 BLOCK, Unknown.
- benign postinstall (node ./scripts/setup.js): 15 ALLOW (T25 only).
- benign prepare (npm run build): 0 CLEAN.
- clean (dev/build only): 0 CLEAN.
History test (synthetic repo-d: malicious package.json in commit 1,
removed in commit 2): working tree clean, history scan flags the
package.json blob at 55 BLOCK in the first commit.
Regression: clean 4/4 at 0, malicious-shaped 85/100/50/40, variants
unchanged, real BlackChain 7/7 still block on the study VPS.
No node processes left running on the study VPS.

## v1.3.2 — trait-calibration fixes — Nov 9, 2026

Applied the Nov 9 per-trait calibration recommendations (R1–R4 from
trait-calibration-analysis-2026-11-08.md; R5 line-colour rule is
artifact-only and NOT part of this engine change; R8 T28/T35 widening
NOT applied, per instruction). Changes in scanner.js:
T02 weight 25 -> 20, T38 weight 25 -> 20, T30 weight 40 -> 50, and
the T04 global-require branch widened from `/global\s*\[[^\]]+\]\s*=\s*require/`
to `/global\[.*\]\s*=\s*require/` so the blob's nested-bracket
assignment `global[_$_3035[0]]= require` now matches (the old pattern
stopped at the inner `]` and could never fire). VERSION bumped to
'1.3.2' in scanner.js + server.js; scanner-browser.js rebuilt with
build-browser-bundle.js; PRODUCT.md / README.md version references
and BlackChain / smoke-test scores updated to the new numbers.

### Verification — all ACTUAL numbers, re-run against v1.3.2 (not simulated)

Simulation vs actual: ZERO deviations. Every number the calibration
simulation predicted reproduced exactly on the real engine.

- Browser bundle parity: build-browser-bundle.js reports 23/23 scores
  match the Node engine (incl. attribution family). Bundle VERSION
  '1.3.2', weights T02 20 / T30 50 / T38 20 confirmed in the bundle.
- Local fixtures (Node engine): clean 4/4 at 0 (unchanged).
  Malicious-shaped: config-after-export 85 -> 80 (T01 40 + T02 20 +
  T07 20), marker-v1 60 unchanged, npm_cli.js 50 unchanged,
  tasks.json 40 unchanged. Variants: 01 100, 02 0, 03 80, 04 100,
  05 100, 06 85 -> 80, 07 65 -> 60, 08 100, 09 25 -> 20 (review ->
  allow, T02 alone), 11 85 -> 80, 10-minified-clean 0; pkg fixtures
  55/55/15/0/0 unchanged. Only variant 09 changes verdict; every
  other score change is T02 -5 on an uncapped file.
- BlackChain real sample (study VPS, /root/scanner.js synced to
  v1.3.2, md5 7875fcb020f90b157faed6e67bf4a220): 7/7 BLOCK.
  ed postcss 100 (high), trading postcss 100 (high), origin-main
  postcss 100 (medium), ed eslint 95 -> 90 (medium),
  trading eslint 95 -> 90 (medium), origin-main eslint 95 -> 90
  (medium), npm_cli.js 90 -> 85 (medium). Attributions unchanged.
  All three score drops are T02 25 -> 20; no verdict or family
  changes.
- Shai-Hulud ground truth (study VPS, 12 packages, 305 files):
  279 allow / 1 review / 25 block; 12/12 packages have a block
  file. Matches the simulation exactly (was 248/34/23). The 2
  @cap-js setup.mjs loaders now block at 50 (T30 alone, was 40
  review). The 31 angulartics2 library files demoted review -> allow
  (T02 alone now 20). The 1 remaining review file is
  flat-cache_6.1.24/package/Math_Symbol.js at 40 (T02+T07) — a
  legitimate library file, the bundle-scope residual from R10.
- Extension manifests (study VPS): fake Rabby 80 block, Phantom 30
  review, MetaMask 30 review — unchanged from v1.3.1.
- Clean corpus (study VPS, /root/clean-corpus/, 55,997 files,
  55,171 scanned, 826 binary-skipped): 55,145 allow / 24 review
  (0.043%) / 2 block (0.004%). Matches the simulation exactly (was
  54,915 / 251 / 5). Per-trait fires unchanged from v1.3.1 (weights
  do not change firing): T02 250, T07 491, T04 27, T15 18, T25 11,
  T38 8, T34 2, T21 1.
  - Remaining 2 BLOCK files (both next.js .github/actions dist
    bundles, the R10 residual): needs-triage/dist/index.js 60
    (T02+T07+T38, was 70), validate-docs-links/dist/index.js 80
    (T02+T04+T07+T38, was 90).
  - Remaining 24 REVIEW files: 3 dist files demoted block -> review
    at 40 (T02+T38: next-integration-stat, pr-auto-label,
    pr-stack-ci-gate); 18 next.js compiled/ vendored files at 40
    (T02+T07); axios THREATMODEL.md 40 (T15+T34); next.js
    is-private-ip.test.ts 25 (T34 alone); turbopack mod.rs 40
    (T04+T07).
- T04 widened-branch check: the pattern `/global\[.*\]\s*=\s*require/`
  matches the blob line on exactly 3/7 BlackChain files (the three
  postcss files) and 0 files across the 55,171-file clean corpus
  (direct grep tally). NOTE: the calibration harness's `t04Branches`
  field still uses the OLD global pattern for its tally, so it
  reports globalRequireOnly 0 — that field does not measure the
  widened branch; the direct check above is the real verification.
  The 3 postcss files already fired T04 via createRequire, so no
  score changes from the widening; the effect is line attribution
  (the blob line now matches the global pattern).
- Server smoke test (local, demo mode, port 18099): health reports
  version 1.3.2; malicious-shaped postcss 80/block (PolinRider
  medium); clean postcss 0/allow. No stray node processes on the VM
  or the study VPS after the runs.

### What v1.3.2 does NOT change (still open)

- The 2 residual clean blocks + 18 T02+T07 compiled-file reviews
  are the R10 bundle-scope problem: bundled code looks like a blob.
  Needs a path/provenance scoping investigation measured against
  the Shai-Hulud bundle.js files — not another weight tweak.
- 12 traits (T13, T16, T17, T19, T20, T22, T23, T28, T33, T35, T36,
  T37) still have zero positive ground truth in any measured corpus;
  they stay as untested tripwires.
- T28/T35 remain too narrow for the real Shai-Hulud payload (R8);
  widening them needs its own clean-fire measurement first.
- README.md "Scoring (v2)" still says "Require smuggling + eval
  together: 35" — stale since v1.2 (actual is T04 20 + T07 20 =
  40); pre-existing, flagged here, not changed in this pass.
- Proof sheet numbers (0.54% review / 0.013% block on 45,284 files,
  v1.3.1) are now superseded by the v1.3.2 clean-corpus numbers
  above (0.043% review / 0.004% block on 55,171 files). The proof
  sheet PDF itself was NOT touched in this engine-only pass.
