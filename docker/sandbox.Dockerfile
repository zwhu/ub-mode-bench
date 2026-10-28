# Sandbox image: everything an agent might need to drive the task.
# No crapper/dryer/mutator here on purpose — those live in gates/ so the agent
# cannot look at gold-sensitive tooling output while running.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    LC_ALL=C.UTF-8 \
    PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git curl build-essential pkg-config \
      python3 python3-pip python3-venv \
      nodejs npm \
      golang \
      jq yq \
      ripgrep \
    && rm -rf /var/lib/apt/lists/*

# Agent CLIs: wire your actual installer here. The scripts/install_agents.sh
# runs on image build and should install `traecli`, `claude`, or `grok` as
# needed. For the public MVP we leave this as an injection point.
COPY docker/sandbox/install_agents.sh /tmp/install_agents.sh
RUN bash /tmp/install_agents.sh || echo "agents not installed in base image"

# Non-root to prevent agent from clobbering host-mounted volumes.
RUN useradd -m -u 1000 bench
USER bench
WORKDIR /sandbox
