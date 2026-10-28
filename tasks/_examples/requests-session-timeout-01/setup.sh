#!/usr/bin/env bash
# Clone the upstream repo at the recorded base SHA, then sever history and
# strip leak surfaces. Expects provenance to be mounted at /gold/<task>/.
#
# Usage: setup.sh <workdir>
set -euo pipefail

WORKDIR="${1:?workdir required}"
TASK_ID="requests-session-timeout-01"
PROVENANCE="/gold/${TASK_ID}/provenance.yaml"

if [[ ! -f "$PROVENANCE" ]]; then
  echo "ERROR: provenance not mounted at $PROVENANCE" >&2
  exit 2
fi

REPO=$(yq -r '.repo' "$PROVENANCE")
BASE_SHA=$(yq -r '.base_sha' "$PROVENANCE")
MIRROR=$(yq -r '.mirror' "$PROVENANCE")

mkdir -p "$WORKDIR"
cd "$WORKDIR"

# Shallow fetch the exact base commit from the local mirror, no history.
git init -q
git remote add origin "$MIRROR/${REPO}.git"
git fetch --depth=1 origin "$BASE_SHA" -q
git checkout -q FETCH_HEAD

# Sever history: wipe .git and reinit so agent cannot `git log` or search SHAs.
rm -rf .git
git init -q
git add -A
git -c user.email=bench@local -c user.name=bench commit -q -m "base"

# Strip leak-prone files.
rm -rf CHANGELOG* HISTORY* NEWS* docs/release-notes docs/changelog* .github 2>/dev/null || true
find . -iname "changelog*" -delete 2>/dev/null || true
find . -iname "release-notes*" -delete 2>/dev/null || true

# Apply pre-patch to put code in the "bug present" state.
if [[ -f "/gold/${TASK_ID}/pre_patch.diff" ]]; then
  git apply "/gold/${TASK_ID}/pre_patch.diff"
fi

git add -A
git -c user.email=bench@local -c user.name=bench commit -q -m "task baseline"

echo "ready at $WORKDIR"
