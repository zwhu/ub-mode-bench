#!/usr/bin/env bash
set -euo pipefail
work="${1:?workdir}"
threshold="${2:?threshold}"
image="${3:?task gates image}"
args=(docker run --rm --pull=never --network=none --user "$(id -u):$(id -g)" -v "$work:$work:rw" -w "$work" "$image" dryer --changed --threshold "$threshold")
printf -v command '%q ' "${args[@]}"
exec sg docker -c "$command"
