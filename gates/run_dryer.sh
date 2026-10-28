#!/usr/bin/env bash
# Returns the count of block pairs with similarity >= threshold.
set -euo pipefail
WORKDIR="${1:?workdir}"
THRESHOLD="${2:?threshold}"
IMAGE="${3:?gates image}"

docker run --rm --network=none \
  -v "$WORKDIR":/work:ro \
  -w /work \
  "$IMAGE" \
  bash -lc "dryer --threshold=$THRESHOLD --count-only src/ test/ tests/ 2>/dev/null || echo 0"
