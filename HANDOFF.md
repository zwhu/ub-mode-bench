# HANDOFF：ub-mode 夜间评测

> 本文件记录当前阶段的状态、计划和验收标准，是计划的唯一来源。中断后先读本文件，再读
> `reports/overnight/PROGRESS.md` 的最后 20 行，然后按 §6 继续。
>
> 更新时间：2026-10-29 09:31 CST

## 1. 目标

用脚本评测 [`unclebob/ub-mode`](https://github.com/unclebob/ub-mode) 这个 skill 的实际执行效果。

- 指标：在同一个模型内，看 C（ub-mode）减 A（无 skill）的差值。不对模型做横向排名。
- 执行器是 traecli，每个 run 都在 docker 里隔离执行。
- 模型都用最高推理档位：

| 模型 | 推理档位 | traecli 运行模式 |
|---|---|---|
| `GPT-6.1-Sol` | `xhigh` | codex |
| `GPT-5.6-Luna` | `xhigh` | codex |
| `DeepSeek-V4.1-Flash` | `high` | claudecode |

GPT 和 DeepSeek 在 traecli 里走的 harness 不同，系统提示词和工具集都不一样，报告里要写明。

## 2. 当前状态

- 当前工作树已清理身份信息和内部环境绑定，只保留评测、审计与本地报告生成命令。
- 历史运行证据与构建缓存保存在仓库外；使用 `BENCH_ARTIFACTS_DIR` 指定本地证据根目录。
- CLI 使用配置中的 PATH 命令；容器需要独立二进制时通过 `BENCH_EXECUTOR_BIN` 指定。
- 清理后类型检查、14个测试、Vue18次报告、旧54次验收及容器执行器启动检查通过。
- 本轮代码和报告已完成收口检查；提交与推送状态以Git日志和远端分支为准。已有Git历史署名未改写，公开基础镜像尚未完整联网重建。

- 运行进度：vue-formal 18/18，UTC 2026-10-29T07:50:41.880Z。



- S0–S5 `PASS_CANDIDATE`；第三轮干净smoke6/6、正式54/54全部completed/valid，public+hidden54/54通过。
- 原污染36formal+6smoke已归档，不计统计；修正ufo1.6.3/defu6.1.4后一次性36slot回放完成。smoke和formal回放尝试数均幂等合并为原1+新1=2，原始SHA核对一致。
- UNC18结果哈希保持原样；原DeepSeek C3 mutation null及原因保留，其他正式指标非null。所有模型/任务/seed原始值、均值、n及C−A已独立核对。
- 正式回放 PID3563951/session54969 已终态（exit0）；所有旧formal/smoke进程亦终态，禁止重启。54项原始artifact audit通过，最终lint/9测试通过，宿主登录检查通过。
- benchmark容器0、auth symlink0，`ubm-internal`空网络已删除；12个镜像标签及gold/raw/quarantine/wheel/parser/source缓存保留，清单在早报及 `reports/overnight/cleanup.json`。
- S6 `PASS_CANDIDATE`：最终早报与代码已推到 `overnight-2026-10-29`；代码/结果提交 `1fec887eefbaad55ebf01424f262a68be85bab09`，远端SHA核对一致，main仍为f74f71f。其后的收口文档提交同步本次状态。作者/message已核对，没有Co-authored-by。
- LIMITED：PR merge时间未独立核验；一项mutation因30分钟剩余预算/20分钟cap为null。没有BLOCKED项。
- UTC 2026-10-29T01:31:19.233195+00:00。

## 3. 已对齐的决策

**变体**

- 只跑 A 和 C，不跑 B/D。
- A：`skills: []`，宿主 `~/.trae/skills` 里的用户 skill 不能漏进来。
- C：只有 ub-mode 加 `crapper`/`dryer`/`mutator` 三个工具，prompt 前缀是 `/ub-mode`。
- 上游版本固定为：ub-mode `57a8bdd`、crapper `6fd92c4`、dryer `66ff6d2`、mutator `a5a0cb8`。

**任务**

- 3 个 TypeScript 仓库的真实开源 PR，类型都是 bug_fix。
- 不把失败测试给 agent。hidden tests 用 PR 新增的测试。
- `gold/` 只留在本地，不提交。
- 工作区去掉 git 历史、CHANGELOG 和 `.github`，不做 AST 改名。
- 任务由 agent 夜里挑选、编写；用户早上审核，被否掉的任务重跑。

**规模**

- smoke：1 任务 × 2 变体 × 3 模型 × 1 seed，共 6 个 run。
- smoke 全部通过后，自动进入正式跑：3 任务 × 2 × 3 × 3 seed，共 54 个 run。
- 没有额度限制。

**指标**

- 只用自动指标。
- gates 只对改动文件运行。
- CRAP 阈值 10，重复度阈值 0.8。
- mutation 最多跑 20 分钟，超时记 `null`，不能记 0。
- “第一个 commit 是失败测试”要同时满足三条：
  1. 这个 commit 只改了测试文件；
  2. 在这个 commit 上，这些测试失败；
  3. 在最终 commit 上，这些测试通过。
- C 组的 run 如果没有 ub-mode 已加载的证据，判为无效并单独列出。

**执行**

- 单个 run 超时 30 分钟，并发 2。
- 只有基础设施失败才重试，最多一次。

**容器配置**

- 禁用 memories、plugins、bundled skills、web search 和 commit attribution。
- agent 只能访问模型调用和鉴权需要的域名，不能访问 github、npm 等站点，防止查到原 PR。
- 宁可停下来，也不放宽网络或隔离。

**凭证**

- 先试方案①，失败再退到方案②（见 S1）。
- 绝不把 refresh token 放进容器。两个进程各自刷新会把对方的 token 刷失效，宿主登录（包括用户正在用的会话）就会掉线。

**状态词**

- 只用 `PASS_CANDIDATE` / `LIMITED` / `BLOCKED` / `FAIL`。PROGRESS 里另外允许 `IN_PROGRESS`。
- `PASS` 只能由用户给。

## 4. 初始脚手架问题（已在S3修复）

- `runners/*`、`score/aggregate.ts` 没有模型维度。
- adapter 调用的 `traecli --non-interactive --prompt-file` 并不存在，`bench.yaml` 里的 `trae` cmd 也是错的。
- diff 统计用的是 `HEAD~1`，应该对比 base commit 和最终状态。
- `gates/*.sh` 用了不存在的参数（`--count-only`、`--survivors-count`、`--format=json --diff`）。
- `docker/gates.Dockerfile` 用 `go install` 装工具，但这几个工具其实是 Python 的。
- `tasks/_examples/*` 依赖空的 `gold/`，不能运行。它们不参与评测。
- `package.json` 没有 `test` 脚本。

## 5. 步骤和验收标准

### S0 docker：PASS_CANDIDATE

docker 已安装，用户已加入 docker 组，`ubm-internal` 网络可以创建。

### S1 选型（每个方案限时 45 分钟）

**方案①：宿主 traecli + 容器内 exec-server**

- 宿主上的 traecli 设置 `TRAECLI_EXEC_SERVER_URL=ws://<容器IP>:4300`，把执行路由到容器里。
- 模型调用发生在宿主，容器可以完全不出网。
- 待验证：
  - 能否用 `TRAE_HOME=<干净目录>` 隔离配置和 skills，同时让鉴权继续使用宿主的 `~/.trae/cli/auth.json`（比如通过 `TRAECLI_HOME`）？
  - 不能复制一份带 refresh token 的副本。

**方案②：traecli 跑在容器里**

- 容器里的 `auth.json` 只保留 access token，去掉 `refresh_token` 和 `device_code`。
- 容器放在 internal 网络里，只能经过 allowlist 代理（squid）出网。
- access token 大约 2 小时过期，容器自己不能刷新。所以 harness 在每个 run 开始前检查宿主 `auth.json` 的 `expires_at`：
  - 剩余不到 40 分钟时，先在宿主跑一次最小的 traecli 调用，让宿主自己刷新；
  - 再把新的 access token 复制进容器。
- 这样只有宿主一个刷新方。

**验收**

两个方案用同一套检查，`GPT-5.6-Luna` 和 `DeepSeek-V4.1-Flash` 各跑一次：

1. shell 命令在容器里执行：hostname 是容器，能读到 marker 文件。
2. agent 用文件工具（不是 shell）写的文件出现在容器里，宿主上没有。
3. agent 用文件工具读不到宿主文件，例如本仓库的 `gold/` 或 `~/.trae/skills`。如果读得到，就是防泄漏失败，方案直接不可用。
4. 只加载了预期的 skill：
   - 干净 home 下列不出任何用户 skill；
   - 装上 ub-mode 后，能用 `/ub-mode` 触发，并且事件流里有加载证据。
5. 模型调用成功。方案②下，容器访问 github.com 和 registry.npmjs.org 必须失败。
6. 宿主登录不受影响：spike 前后各在宿主正常跑一次 `traecli exec`，都要成功。

结论写到 `reports/overnight/S1-decision.md`，附上命令、退出码和事件流片段作为证据，并在 PROGRESS 记一行。两个方案都不过就标 BLOCKED，停在这一步。

### S2 准备 3 个 TypeScript 任务

**选题条件**

- 仓库体量小，用 vitest 或 jest 测试，依赖能预先装进镜像，跑测试时不用联网。
- PR 是 bug fix 且带新增测试。新增测试在 base 上失败、在 merge 后通过。diff 不大，例如源码改动少于 150 行。
- 优先选 merge 时间较新的 PR，降低模型背过答案的概率。

**产出**

- `tasks/<id>/`：
  - `task.yaml`；
  - `prompt.md`：写成 issue 描述，不带测试；
  - `setup.sh`；
  - `allowed_paths.txt`。
- `gold/<id>/`：hidden tests、参考 patch、来源 PR 链接。
- Node 镜像：hub 上没有 node 镜像，基于 `debian:bookworm-slim` 加 node 官方二进制包（或 npmmirror）自己构建，并固定版本。

**验收**

新增 `pnpm task:validate <id>`，对每个任务检查：

1. 在 base 上，可见测试通过，hidden tests 失败。
2. 应用参考 patch 后，hidden tests 和可见测试都通过。
3. 工作区里没有 git 历史、CHANGELOG、`.github`，也搜不到 PR 号和 PR 标题。
4. 在容器断网的情况下能跑测试。

### S3 harness

**要做的事**

- 新增 `--models` 参数。模型维度要贯穿 run id、目录、`result.json` 和 aggregate，aggregate 按模型分组计算 C−A。
- 按 S1 的选型写真实的 traecli adapter：
  ```
  traecli exec -m <model> -c model_reasoning_effort=<lvl> --json -o <file> -y --ephemeral --skip-git-repo-check
  ```
  使用干净的 `TRAE_HOME`，禁用项见 §3。
- 修 gates：
  - 脚本改成真实的 CLI 参数：crapper `--changed --threshold`，dryer `--changed --threshold`，mutator `--changed --test-command`。
  - gates 镜像改成用 pip 从固定的 git SHA 安装。
- diff 统计改成对比 base commit 和最终状态。
- 新增两个指标：commit 序列（第一个 commit 是不是失败测试）和 C 组的 ub-mode 加载证据。
- 断点续跑：已经有完整 `result.json` 的 run 直接跳过。
- 超时、并发、重试按 §3 执行。

**验收**

1. `pnpm lint` 通过。
2. `pnpm test` 通过。新增的单测至少覆盖：矩阵展开、结果解析、aggregate 按模型分组、续跑跳过。
3. `--dry-run` 分别列出 smoke 的 6 个 run 和正式的 54 个 run。
4. 手动单跑一个 run，能完整跑通。

### S4 smoke（6 个 run）

**验收**（全部满足才算通过）

1. 6 个 run 都有 `result.json`，状态是 completed，不是基础设施错误。
2. hidden tests、CRAP、重复度、mutation 都有数值。某项为 `null` 时必须写明原因。
3. 3 个 C run 都有 ub-mode 加载证据，3 个 A run 没有加载任何 skill。
4. 网络合规：方案②下代理日志里只有 allowlist 域名；方案①下容器没有外网。
5. 宿主 traecli 登录正常。

全部通过就直接进 S5。没通过就修 harness 后重跑 smoke，最多 3 轮；还不过就标 LIMITED 或 BLOCKED，写早报，然后停止。

### S5 正式跑（54 个 run）

**验收**

1. 54 个 run 都有终态：要么 completed，要么是写明原因的无效。
2. 有效 run 至少占 90%，不到就标 LIMITED。
3. aggregate 给出每个模型的 C−A。每项指标都给出均值、n，以及每个 seed 的原始值。

### S6 收尾

- 早报写到 `reports/overnight-2026-10-29.md`，内容包括：
  - 选型结论和证据；
  - 3 个任务和来源 PR，供用户审核，不写 hidden tests 的内容；
  - smoke 结果；
  - 正式结果表（每个模型的 C−A）；
  - 无效 run 和原因；
  - LIMITED / BLOCKED 项；
  - 需要重跑的部分。
- 更新本 HANDOFF。
- 提交并推送到新分支 `overnight-2026-10-29`，不直接推 main。`gold/`、`runs/`、`reports/*/` 不提交。
- 清理容器和网络。如果有保留，在早报里写明保留了什么。

## 6. 中断续跑协议

1. 读本文件，再读 PROGRESS.md 的最后 20 行。
2. 找到最后一个状态不是 PASS_CANDIDATE 的步骤，从它继续。已完成的步骤不重做。
3. run 级别：
   - `runs/<run_id>/result.json` 存在且完整的，跳过；
   - 有目录但没有 `result.json` 的，视为被中断，删掉目录重跑，不计入重试次数。
4. 开跑前清理残留的 `ubm-*` 容器。
5. 每完成一步，或每完成 6 个 run，就往 PROGRESS.md 追加一行，格式是 `[UTC 时间] 步骤 | 状态 | 做了什么 | 证据路径`。状态有变化时，同步更新本文件 §2。

## 7. 停止和 BLOCKED 条件

- 必须放宽网络或隔离才能继续：停止这条路径，标 BLOCKED。
- 宿主登录坏了（在宿主跑最小的 traecli 调用，鉴权失败）：依赖模型的步骤标 BLOCKED，继续做不依赖模型的步骤，例如任务校验、单测、报告。
- 同一种基础设施错误连续出现 3 次：暂停跑 run，排查原因；查不出来就标 BLOCKED。
- 结果存储所在文件系统剩余空间不到 30G：停止跑 run。
- 以下内容一律不碰：全局 traecli 配置、宿主 `~/.trae/skills`、其他仓库。

## 8. 启动时的问题（结论已验证，证据见S1/S2/S3）

- 方案①：exec-server 会不会把文件工具也路由进容器？二进制里能看到 `FsReadFile`/`FsWriteFile` 等 RPC，也能看到 “filesystem sandbox cannot be enforced on this executor” 这句提示。
- 方案①：`TRAE_HOME` 和 `TRAECLI_HOME` 各管什么？能否共用宿主鉴权、只隔离配置？
- 方案②：容器里显示 `installation: public`，会不会影响可用模型？
- 方案②：模型调用和鉴权需要哪些域名？从 traecli 日志里抓出清单。
- crapper 接受什么格式的 TS 覆盖率输入？如果不支持，就用 `--no-coverage`，该指标标 LIMITED。
- 构建镜像时，docker 默认 bridge 网络能不能出网？构建阶段需要装 node 包和 pip 包。

## 9. 早上用户验收清单

1. 看早报里的选型结论和证据。
2. 审核 3 个任务的来源 PR 和 prompt，标出要否掉的任务，否掉的任务重跑。
3. 抽查 1–2 个 C run 的事件流，确认 ub-mode 真的在起作用。
4. 看 C−A 结果表和无效 run 列表。
5. 确认推送的分支名和提交作者。

## 10. 后续较大任务候选（2026-10-29）

用户要求改用更大仓库或较大 PR。首选 Vue core #15136，固定 base 为
`c04a45d15498ebba0de3ceae674b88ac43cb9e76`，fix 为
`a4440c01b96798a23bef12cb6f9ada5ffaba0d3a`；业务源码最终差异134行、4模块。
精确快照及断网针对性验证已完成：原基线138项相关测试通过，修复后139项通过；
同一缓存失效回归在基线上因实际导入丢失失败，修复后通过，生产源码未改写。

候选调查记录为 `reports/next-round/larger-task-selection.md`，详细来源与运行证据在
同目录。TanStack Router #8084为更大备选，其环境/回归尚未验证，标LIMITED。
旧S0–S6及54次结果保持原状态。

用户已选定Vue。新任务ID为`vue-template-cache`；仅允许compiler-sfc的源码与测试路径，
行数分类覆盖多包src与__tests__。A无skill、C仅ub-mode，最高推理档位沿用原规则。
新的校准命名空间`vue-calibration`：Sol A/C各一次；通过后新正式命名空间
`vue-formal`：1任务×3模型×A/C×3次重复=18次。单run30分钟、并发2、mutation20分钟，
基础设施至多重试一次；任务失败不重试。新结果不与原54次合并。

镜像只含预装依赖，不含Vue源码或答案；基线快照去掉Git历史、changelog和.github，
无原生agent配置。`scripts/aliases.js`改为按当前工作目录解析源码别名，确保变异worker
读到其私有源码；生产源码仍为官方base。隐藏回归沿用已校验的公开API缓存挤出方式。
任务与参考修复四阶段断网校验通过；coverage/crapper/dryer与mutation扫描可运行。
结果报告只展示业务源码改动行数。

校准已启动，日志`reports/vue-2026-10-29/calibration-run.log`，运行namespace
`runs/vue-calibration/`；当前A模型已结束、隐藏回归通过，外部mutation仍在执行，C模型
质量检查尚未结束。原校准镜像为`:2026-10-29`，公开验收为3个相关测试文件。
不要重启已运行的pair，等待完整result.json，再用
`pnpm exec tsx scripts/report_vue.ts vue-calibration`审计和产出校准报告。

校准发现部分模型新增测试文件不在上述3文件命令内。正式条件改为整个compiler-sfc
测试目录，原base469项、官方fix470项在宿主通过；已补齐TS6/Sass等依赖。
正式镜像`:2026-10-29-full-sfc`与对应`-gates`单独构建，未覆盖正在使用的校准镜像。
外部mutator显式`--max-workers 2`，prompt向A/C都给出相同CPU/内存/总时限信息，
每run保存task/config快照和image ID。校准v1不与正式18次混算。

正式启动前：完成新镜像四阶段断网`pnpm task:validate vue-template-cache`；类型检查及
tests通过；校准完整result.json均valid、无无法解释的null。允许算法本身修复失败，
不能因为失败而重试。完成后执行
`pnpm exec tsx runners/cli.ts run --tasks vue-template-cache --seeds 3 --phase vue-formal`
并将stdout/stderr写`reports/vue-2026-10-29/formal-run.log`；完成用
`pnpm exec tsx scripts/report_vue.ts vue-formal`审计输出报告与source-only.csv。

Vue 正式运行已结束，18 次结果和独立复核记录已保存。后续通过评测 CLI 执行任务、通过本地报告脚本生成报告。

Sol校准2/2有效并通过公开/隐藏；A源码102行、CRAPmean11.0481、模型阶段6.78分钟、survivors27；C源码111行、CRAPmean10.4964、18.52分钟，mutation因剩余run预算为null。校准v1完整结果在runs/vue-calibration，不与formal合并。正式全SFC四阶段469/1/469/470通过，12个TS测试和3个Python交付测试通过。

用户要求追踪agent规则与skill影响，已完成当前源快照、任务基线、13次正式context与
2次校准、事件、依赖内文件、存活容器和实际cwd探针审计。官方Vue与678文件基线无
常见agent规则；宿主技能被禁用，C仅ub-mode且实际读完整内容。依赖playwright-core
物理带3个SKILL.md，但未进入可用目录、未见实际读取，须保留此事实及证据限制。

发现Luna A2/A3/C1/C2实际spawn子agent，随后关闭，违反No delegation。原解析器漏查，
已补检测与13项TS测试通过；原result.json不改写，scripts/report_vue.ts独立协议审计
将这4次从有效汇总排除。子记录未完整保存，不能以no-op提示断言无影响；不自动重跑。
最终以vue-formal/protocol-audit.json有效数为准，旧的“所有样本valid”只为原runner口径。
审计报告reports/vue-2026-10-29/agent-instruction-audit.md，自动扫描脚本
scripts/audit_vue_instructions.py已接入报告生成，后续全部运行会刷新目录/事件审计。

审计修正（UTC 2026-10-29T06:12:06.115580+00:00）：LunaC1原始hidden失败卡在descriptor.ast.transformed内部断言，其修复clone原AST避免就地转换。去掉仅限定实现的断言后，base真实输出失败、官方fix与LunaC1输出通过，证据reports/vue-2026-10-29/behavioral-review/summary.json。保留原始result指标；最终scripts/report_vue.ts会对所有终态样本执行scripts/review_vue_behavior.py，完整SFC目录断网统一复核，CSV末列behavioral_recheck_passed及报告独立呈现。不得把原内部断言失败直接计为修复失败，模型不重跑。

最新分析口径（UTC 2026-10-29T07:51:50.732258+00:00，用户明确决定）：委派不作为排除条件，LunaA2/A3/C1/C2全部保留参与整体A/C汇总；委派事件仅列观察项，不能再报14有效/4排除。18次模型运行均已终态，原始result不变；最终按18次汇总并统一行为复核。前文严格排除策略被本决定覆盖，依据reports/vue-2026-10-29/analysis-policy.json。

Vue正式轮终态（UTC 2026-10-29T07:54:58.512296+00:00）：18/18完成，18有效，PASS_CANDIDATE。报告与源码CSV已生成；原60份结果SHA256核对一致。

修复真实性补充核验（UTC 2026-10-29T08:10:28.604618+00:00）：只导入18份生产源码到干净base，恢复原版测试及固定配置，加入修复后生成新标识符的客户端/SSR两项回归；base469原测试通过/new2失败，参考修复471通过，18份源码均471通过。证据reports/vue-2026-10-29/source-only-replay/summary.json。独立检查避免模型改过的测试参与证明，但不能证明零其他bug/未见训练答案。mutation16null来自20分钟评分cap或30分钟剩余预算；一份仅约1.5秒评分机会，本轮不能推断稳定测试强度收益。说明已写入本地报告。

详细结构化报告（UTC 2026-10-29T08:18:33.320642+00:00）：用户要求按结论/实验条件/修复证明/源码与耗时/质量及缺失/观察项/18次明细组织，已生成reports/vue-2026-10-29-detailed.md。源码不含测试；按全部18次保留委派观察；所有均值与n重算对照raw正确，附独立source-only证明与mutation缺失解释，已生成本地 Markdown 和 CSV。
