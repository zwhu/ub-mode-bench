FROM hub.byted.org/library/debian@sha256:78d2f66e0fec9e5a39fb2c72ea5e052b548df75602b5215ed01a17171529f706
ENV DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git curl python3 python3-pip python3-venv ripgrep xz-utils \
    && rm -rf /var/lib/apt/lists/*
COPY docker/vendor/node-v22.16.0-linux-x64.tar.xz /tmp/node.tar.xz
RUN echo 'f4cb75bb036f0d0eddf6b79d9596df1aaab9ddccd6a20bf489be5abe9467e84e  /tmp/node.tar.xz' | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm /tmp/node.tar.xz
RUN npm install --global pnpm@11.9.0 --registry=https://registry.npmjs.org
RUN useradd -m -u 1000 bench
WORKDIR /sandbox
