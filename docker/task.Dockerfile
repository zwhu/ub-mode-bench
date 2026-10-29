FROM ub-mode-bench/sandbox:2026-10-29
ARG TASK_ID
COPY tasks/${TASK_ID}/base/ /opt/task/
WORKDIR /opt/task
# Keep transitive copies of the challenge libraries before their target fixes.
RUN node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("package.json","utf8")); p.pnpm={...p.pnpm,overrides:{...p.pnpm?.overrides,ufo:"1.6.3",defu:"6.1.4"}}; fs.writeFileSync("package.json",JSON.stringify(p,null,2));'
RUN pnpm install --registry=https://registry.npmmirror.com --ignore-scripts
RUN find node_modules/.pnpm -path '*/esbuild/install.js' -exec node {} \; \
    && chmod -R a+rX /opt/task
WORKDIR /sandbox
