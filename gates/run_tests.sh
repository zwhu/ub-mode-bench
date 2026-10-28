#!/usr/bin/env bash
# Run the public tests declared by a task inside the gates container.
# This container has pytest, node, go, rust, java toolchains installed.
set -euo pipefail
WORKDIR="${1:?workdir}"
IMAGE="${2:?gates image}"

docker run --rm --network=none \
  -v "$WORKDIR":/work:rw \
  -w /work \
  "$IMAGE" \
  bash -lc 'bash /work/.bench_public_tests.sh 2>&1'
