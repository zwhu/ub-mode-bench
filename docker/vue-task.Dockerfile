FROM ub-mode-bench/sandbox:2026-10-29
COPY docker/vendor/vue-node-modules/ /opt/task/node_modules/
RUN mkdir -p /opt/task/node_modules/.vite-temp /opt/task/node_modules/.vite \
    && chmod -R a+rX /opt/task/node_modules \
    && chmod -R a+rwx /opt/task/node_modules/.vite-temp /opt/task/node_modules/.vite
WORKDIR /sandbox
