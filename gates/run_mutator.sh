#!/usr/bin/env bash
# Returns the number of surviving mutants.
set -euo pipefail
WORKDIR="${1:?workdir}"
IMAGE="${2:?gates image}"

docker run --rm --network=none \
  -v "$WORKDIR":/work:ro \
  -w /work \
  "$IMAGE" \
  bash -lc 'mutator --quiet --survivors-count'
