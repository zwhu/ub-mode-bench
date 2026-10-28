#!/usr/bin/env bash
set -euo pipefail
WORKDIR="${1:?workdir required}"
TASK_ID="lodash-dedup-03"
PROVENANCE="/gold/${TASK_ID}/provenance.yaml"
[[ -f "$PROVENANCE" ]] || { echo "missing $PROVENANCE" >&2; exit 2; }

REPO=$(yq -r '.repo' "$PROVENANCE")
BASE_SHA=$(yq -r '.base_sha' "$PROVENANCE")
MIRROR=$(yq -r '.mirror' "$PROVENANCE")

mkdir -p "$WORKDIR" && cd "$WORKDIR"
git init -q
git remote add origin "$MIRROR/${REPO}.git"
git fetch --depth=1 origin "$BASE_SHA" -q
git checkout -q FETCH_HEAD
rm -rf .git
git init -q
git add -A
git -c user.email=bench@local -c user.name=bench commit -q -m "base"

rm -rf CHANGELOG* HISTORY* NEWS* docs/release-notes docs/changelog* .github 2>/dev/null || true
find . -iname "changelog*" -delete 2>/dev/null || true

if [[ -f "/gold/${TASK_ID}/pre_patch.diff" ]]; then
  git apply "/gold/${TASK_ID}/pre_patch.diff"
fi
git add -A
git -c user.email=bench@local -c user.name=bench commit -q -m "task baseline"
echo "ready at $WORKDIR"
