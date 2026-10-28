#!/usr/bin/env bash
# Run hidden tests from the private gold/ submodule. Mounted read-only so the
# agent (long gone by now) could never see them.
set -euo pipefail
WORKDIR="${1:?workdir}"
TASK_ID="${2:?task id}"
IMAGE="${3:?gates image}"

GOLD_HOST="${BENCH_GOLD_DIR:-$(pwd)/gold}"
if [[ ! -d "$GOLD_HOST/$TASK_ID/hidden_tests" ]]; then
  echo "no hidden tests mounted for $TASK_ID" >&2
  exit 127
fi

docker run --rm --network=none \
  -v "$WORKDIR":/work:rw \
  -v "$GOLD_HOST/$TASK_ID/hidden_tests":/hidden:ro \
  -w /work \
  "$IMAGE" \
  bash -lc 'cp -r /hidden/* ./ 2>/dev/null; bash /hidden/run.sh'
