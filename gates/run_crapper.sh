#!/usr/bin/env bash
# Runs crapper against the diff vs. HEAD~1. Emits JSON: {"max": N, "mean": M}.
set -euo pipefail
WORKDIR="${1:?workdir}"
IMAGE="${2:?gates image}"

docker run --rm --network=none \
  -v "$WORKDIR":/work:ro \
  -w /work \
  "$IMAGE" \
  bash -lc 'crapper --format=json --diff=HEAD~1..HEAD'
