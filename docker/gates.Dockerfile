# Gates image: deterministic quality-gate tooling. Lives separately from the
# sandbox so the agent never has access to it mid-run.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git curl python3 python3-pip \
      nodejs npm golang build-essential ripgrep jq \
    && rm -rf /var/lib/apt/lists/*

# Install the Uncle Bob quality-gate tools. These are small Go/Python CLIs; if
# unavailable at image build, individual gate scripts degrade to null results
# instead of silently zero-filling (see runners/collect.ts).
RUN pip install --no-cache-dir --break-system-packages \
      "pytest>=8" "coverage>=7" \
    && go install github.com/unclebob/crapper@latest 2>/dev/null || true \
    && go install github.com/unclebob/dryer@latest   2>/dev/null || true \
    && go install github.com/unclebob/mutator@latest 2>/dev/null || true

ENV PATH="/root/go/bin:${PATH}"
