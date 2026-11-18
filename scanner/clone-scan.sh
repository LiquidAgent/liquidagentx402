#!/usr/bin/env bash
# Liquid Agent clone-level scan (v1.2, Nov 8, 2026).
# Clone a repo, scan it BEFORE anything is installed or run, and report
# a verdict. The malware this engine hunts sits inert in config files
# after a clone and fires on `npm install` / `npm run dev` — so the
# window between clone and install is where detection has to happen.
#
# What it does:
#   1. git clone <url> [dest]          (clone runs no repo code)
#   2. node scanner.js <dest>          (working tree, HEAD)
#   3. node scan-history.js <dest>     (every commit's config files)
# What it never does: npm install, npm run, or execute anything from
# the repo. If the verdict is BLOCK, do not run npm install in it.
#
# Usage: ./clone-scan.sh <repo-url> [dest-dir]
# Exit 0 = clean, 1 = review, 2 = block.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="${1:-}"
DEST="${2:-}"

if [ -z "$URL" ]; then
  echo "Usage: $0 <repo-url> [dest-dir]" >&2
  exit 2
fi
if [ -z "$DEST" ]; then
  DEST="$(basename "$URL" .git)"
fi
if [ -e "$DEST" ]; then
  echo "Destination already exists: $DEST" >&2
  exit 2
fi

echo "== Cloning $URL -> $DEST (no code from the repo is run) =="
git clone "$URL" "$DEST" || exit 2

echo ""
echo "== Working tree scan (HEAD) =="
node "$DIR/scanner.js" "$DEST"
TREE_RC=$?

echo ""
echo "== Git history scan (all commits) =="
node "$DIR/scan-history.js" "$DEST"
HIST_RC=$?

echo ""
RC=0
[ "$TREE_RC" -gt "$RC" ] && RC=$TREE_RC
[ "$HIST_RC" -gt "$RC" ] && RC=$HIST_RC
if [ "$RC" -eq 2 ]; then
  echo "VERDICT: BLOCK — do NOT run npm install in $DEST. Malicious code found."
elif [ "$RC" -eq 1 ]; then
  echo "VERDICT: REVIEW — suspicious, look at the flagged files before installing."
else
  echo "VERDICT: CLEAN — no traits found in the working tree or in history. Safe to install."
fi
exit "$RC"
