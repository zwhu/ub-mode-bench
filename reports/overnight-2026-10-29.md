# ub-mode 测试结果：加上这套做事规矩，AI 修 bug 有没有变好？

2026-10-29。正文按日常语言解释；原始数字和技术证据放在文末附录。

**这轮结果：不用 ub-mode 和使用 ub-mode，各 27 次修复全部通过测试。使用 ub-mode 后，代码的自动风险评分平均降低，但每次平均多花约 2～6 分钟，业务源码改动平均更多。因此，这次还不能说“开了它，bug 就修得更成功”，也不能说“开了它更省时间”。**

## 1. 为什么做这个测试

ub-mode 是一份给 AI 的工作规矩，要求它先复现问题、用测试验证，再做小步修复和整理，并用工具检查复杂代码、重复代码和测试遗漏。

我们想知道：**给同一个 AI 加上这套规矩，它交出来的修复是否更可靠，代码是否更容易维护，为此要多付出多少时间和改动。**

例如，普通方式可能修好 bug 就结束；使用 ub-mode 时，还会被要求检查测试有没有漏掉问题、能否把复杂代码简化。这些要求听起来有道理，是否带来实际收益，要让两种方式修同样的 bug，再用相同的标准验收。

## 2. A 和 C 各自在做什么

| 报告里的名字 | 人话解释 | 实际做法 |
| --- | --- | --- |
| A | 普通方式修 bug | 给 AI 有 bug 的代码、问题描述和测试命令，让它完成修复；不加载额外 skill |
| C | 使用 ub-mode 修 bug | 给同样的任务，额外启用 ub-mode，要求读取它的规矩；执行环境还提供三个质量检查工具 |

**“变体”就是上面这两种做法。** 它不是不同的 bug，也不是不同的模型。A、C 只是实验标签；以后可以直接读作“普通方式”和“ub-mode 方式”。

C 提供的三个工具分别是：crapper 检查代码复杂度与测试覆盖，dryer 找重复代码，mutator 故意改坏一点代码、检查测试能否发现。这轮测的是“ub-mode 规矩 + 可用工具”这套组合的效果，无法单独分出哪一句规矩、哪个工具贡献了多少。

两组完成修复后，都会由同一套外部工具评分。这样不会因为 C 有工具，就只给 C 做更严格的验收。

报告确认了 C 读取过 ub-mode；读取并不代表每条规矩都被完整执行。比如是否先写失败测试，后面还要看具体过程证据。

## 3. C−A、seed 和 54 次分别是什么意思

**C−A 就是“使用 ub-mode 的平均结果，减去普通方式的平均结果”。** 它是为了看加上这套规矩后发生了什么变化。

例如，普通方式平均花 2 分钟，ub-mode 方式花 5 分钟，那么时间的 C−A 就是 +3 分钟：多花了 3 分钟。如果普通方式的风险评分是 6，ub-mode 方式是 5，C−A 就是 −1：评分降低了 1。时间和风险评分通常越低越好；测试通过率越高越好，所以不能只看正负号就说好坏。

**seed 在这份报告里只是“第几次独立重做”的编号：1、2、3。** AI 每次可能走不同的修复路线，所以同一任务、同一模型、同一做法各做三遍，避免只看一次碰巧的结果。这里没有设置模型服务的随机数种子；相同编号不保证重跑时得到一模一样的输出。

正式测试的组成是：**3 个真实 bug × 3 个模型 × 2 种做法 × 每种做法重做 3 次 = 54 次修复。** 每个模型在每种做法下都有 9 次修复，普通方式合计 27 次，ub-mode 方式合计 27 次。每次从有 bug 的起点独立开始。

模型是 GPT-6.1-Sol、GPT-5.6-Luna 和 DeepSeek-V4.1-Flash。比较时，在同一个模型内看“开与不开 ub-mode”的差别。这轮要判断的是 ub-mode 的作用；三个模型的运行配置也有差异，表格不用于给模型排座次。

此外先做了 6 次小规模试跑，确认流程能跑通。附录中的 smoke 就指这些试跑，它们没有混进正式 54 次结果。

## 4. AI 修的是哪些 bug

| 任务 | 问题用人话说 | 修好以后应该怎样 |
| --- | --- | --- |
| URL 路径处理 | 去掉一段 URL 前缀后，多余的斜杠可能让剩下的路径被当成另一种地址 | 正确整理开头的斜杠，并保留其他地址、路径边界和查询参数的原有行为 |
| 配置默认值合并 | 合并 JSON 配置时，特殊属性可能影响结果对象继承的内容，让默认配置不按预期生效 | 阻止这种干扰，同时保留嵌套配置、数组和优先级等正常合并行为 |
| 网络共享路径 | 处理网络共享路径时，表示共享位置的双斜杠根被弄丢，变成普通路径 | 保留网络共享根，并继续正确处理普通路径、盘符和相对路径 |

这三个任务来自开源 TypeScript 项目的真实修复。AI 拿到的是修复前的代码和问题描述；标准答案和隐藏验收测试留在评分侧。

## 5. 结果怎么读

### bug 有没有修好：两种方式都修好了

| 做法 | 原有公开测试 | 额外隐藏验收测试 |
| --- | --- | --- |
| 普通方式 | 27/27 次全部通过 | 27/27 次全部通过 |
| ub-mode 方式 | 27/27 次全部通过 | 27/27 次全部通过 |

公开测试是代码里已有、AI 能看到并运行的测试；隐藏测试是评分时才加入的验收题，用来检查目标问题和相关边界行为。表里的 27/27 是通过整套测试的修复次数，并不是只有 27 条测试题。

普通方式已经全部通过，这轮就没有观测到通过率还能提升多少。通过这些测试说明修复满足了本次验收，不能证明代码再无其他 bug。

### 代码风险评分：使用 ub-mode 后平均更低

CRAP 可以先理解为“复杂代码缺少测试保护的风险评分”。分支越复杂、测试覆盖越少，分数越高；分数降低可以来自代码简化，也可以来自测试补充。它是自动检查的参考值，不是实际 bug 数，也不能直接换算成未来出故障的概率。

| 同一个模型 | 普通方式的平均风险评分 | ub-mode 方式的平均风险评分 | 加上 ub-mode 后的变化 |
| --- | ---: | ---: | --- |
| GPT-6.1-Sol | 5.89 | 5.06 | 降低约 0.83 |
| GPT-5.6-Luna | 5.88 | 4.99 | 降低约 0.89 |
| DeepSeek-V4.1-Flash | 6.24 | 4.98 | 降低约 1.26 |

这是本轮支持 ub-mode 的一个信号。不过评分覆盖整个改动文件里的函数，不只看直接修 bug 的那几行；平均值下降，也不代表每个函数都达到了 ub-mode 要求的分数线。

### 测试会不会漏掉错误：有改善，也有变差

mutation testing 的做法是故意给代码制造小变化，比如把一个判断条件改掉，然后再跑测试。测试发现异常，就抓住了这次变化；测试仍然通过，就留下一个“survivor”。它可以提示测试遗漏，也可能是不会改变实际行为的等价变化，所以 **survivor 不能直接叫作漏洞或真实 bug**。

| 同一个模型 | 普通方式平均留下多少个未被测试发现的变化 | ub-mode 方式平均留下多少个 | 这轮观察 |
| --- | ---: | ---: | --- |
| GPT-6.1-Sol | 0.78 | 0.56 | 略少一些 |
| GPT-5.6-Luna | 0.44 | 0.78 | 多了一些 |
| DeepSeek-V4.1-Flash | 1.33 | 0.50 | 更少，但 ub-mode 组少一次有效测量 |

小数来自多次运行的平均值，并不是一次测试发现了半个问题。不同修复生成的可变异代码也可能不同，不能仅靠这个数量就断定谁的测试一定更强。

DeepSeek 的普通方式有 9 次测量，ub-mode 方式只有 8 次：另一次评分耗尽时间，记录为“没测完”。这不是 0 个 survivor，也不是修复失败；该次修复的公开和隐藏测试仍然通过。样本数不同，这个差值需要更谨慎地看。

### 时间和改动：使用 ub-mode 更费时，业务源码改动更多

| 同一个模型 | 普通方式平均用时 | ub-mode 方式平均用时 | 每次平均多花 |
| --- | ---: | ---: | ---: |
| GPT-6.1-Sol | 1.74 分钟 | 3.97 分钟 | 2.23 分钟 |
| GPT-5.6-Luna | 1.59 分钟 | 6.94 分钟 | 5.35 分钟 |
| DeepSeek-V4.1-Flash | 3.57 分钟 | 9.59 分钟 | 6.02 分钟 |

这里的时间包括执行环境准备，以及 AI 思考、调用工具和修改代码的阶段；不包括修复后的外部验收与评分。它也不是整晚的总耗时，不能用它直接推算 token 费用。

下面的**改动行数只统计业务源码**。每个数字都是同一模型、同一种做法下 9 次修复的平均值，单位为行。

| 同一个模型 | 普通方式：源码改动 | ub-mode：源码改动 | 使用 ub-mode 后多改了多少 |
| --- | ---: | ---: | ---: |
| GPT-6.1-Sol | 3.78 | 16.22 | +12.44 |
| GPT-5.6-Luna | 3.44 | 19.67 | +16.22 |
| DeepSeek-V4.1-Flash | 16.11 | 28.22 | +12.11 |

**三个模型使用 ub-mode 后平均都改了更多业务源码。** 这些数字直接描述业务修复与重构的改动规模。

统计口径：只计 `src/` 中的业务源码。测试代码、测试辅助文件、隐藏测试和日志文档均不计入改动行数。

源码改动行数按**新增行＋删除行**计算，覆盖已提交、未提交和新增文件，包含空行与注释；不是代码净增加量。是否值得这些改动，仍需要结合具体修复内容判断。

### 剩下的指标分别看什么

| 附录里的指标 | 人话含义 | 这轮该怎么理解 |
| --- | --- | --- |
| CRAP max | 改动文件中风险评分最高的函数 | 可能是同文件中的其他函数，所以修好目标函数后这个最大值仍可能不变 |
| 重复对 / dup_pairs_over_threshold | 工具找到多少对相似程度达到阈值的代码 | 两组都为 0；这个指标本轮没有分出差别 |
| commits | AI 在任务代码里提交了多少次 | 普通组为 0；ub-mode 组也只有少量提交，不能据此说它稳定执行了“小步提交” |
| code_diff_lines | 业务源码的新增＋删除行数 | 本报告“改动行数”的统一口径，只计 src/ |
| 首 commit 为失败测试 | 第一份提交是否只有测试，且能回放证明修复前失败、修复后通过 | 所有结果都没有这份证据；它只检查提交记录，无法判断未提交的编辑是否先写了测试 |
| valid | 这次运行是否满足实验条件，可以进入统计 | 正式结果 54/54 有效；不是“所有质量评分都达标”的意思 |
| mean / n | 平均值 / 参与该项平均值的有效测量次数 | 例如 0.50 (8) 表示 8 次有效测量的平均值为 0.50 |
| null | 这项没有可用测量结果 | 需要看超时或工具失败原因，不能把它当 0 |

## 6. 这次能得出多强的结论

**可以确认：这 3 个 bug 上，两种方式都完成了修复；ub-mode 方式平均风险评分更低，同时花费更多时间、修改更多业务源码。测试遗漏指标的方向不一致。**

**目前不足以决定：是否值得在所有编码任务上默认启用。** 只有 3 个小型 bug，每种组合只做 3 次，普通方式又已经全通过；如果要继续评估实际收益，应选普通方式更容易失败、边界更复杂的任务，再看失败是否减少、收益是否值得额外时间。这里是后续建议，不是本次新增测试。

还有两件影响理解的事：

- 中途发现两个任务的依赖包里带着现成修复，可能让 AI 找到答案。受影响的 36 次正式结果和 6 次试跑已排除，换成修复前依赖后重跑。本文统计使用最终干净的 54 次正式结果；另一个任务的 18 次有效结果被保留。
- 模型可能在训练时见过这些开源代码，这次无法证明它从未见过答案；来源 PR 的合并时间也未独立核验。这些限制和那一次未完成的 mutation 测量，都保留在附录。

附录里的 PASS_CANDIDATE 表示“流程和证据已经核对完，供你审核”，**不表示已经证明 ub-mode 有显著收益**。LIMITED 表示某项证据或测量有缺口，具体缺什么要看对应说明。

---

## 附录：技术记录与逐次结果

下面保留技术记录与逐次结果，改动量统一使用业务源码口径。上述正文已经解释主要结论；需要追溯具体数值时再读这一部分。

### 原早报 · 2026-10-29

当前状态：PASS_CANDIDATE。S1–S6 已验收；干净 smoke 6/6、正式 54/54 均有效。报告、代码交付与容器/网络清理已完成；下述LIMITED项保留，最终PASS由用户审核。

## 本轮观察

A/C 的公开和隐藏测试都通过：A 27/27，C 27/27，因此本轮未观察到隐藏回归通过率增益。三个模型各自的 C 组 CRAP mean 均低于 A；mutation survivor 的方向随模型而不同。C 的模型与工具阶段平均用时均增加。

| 模型 | CRAP mean C−A | survivors C−A | 模型/工具阶段额外分钟 |
| --- | ---: | ---: | ---: |
| GPT-6.1-Sol | -0.8313 | -0.2222 | 2.23 |
| GPT-5.6-Luna | -0.8935 | 0.3333 | 5.35 |
| DeepSeek-V4.1-Flash | -1.2591 | -0.8333 | 6.02 |

survivors 越少表示本次自动验证留下的变异更少；DeepSeek 的 C 组该项 n=8，A 组 n=9。完整均值、n 和原始值见下表。所有 A/C run 的“首 commit 为失败测试”指标均为 false；这是未观测到符合三条标准的 commit 证据，不能据此推断是否采用过未提交的测试先行编辑。

本轮只有3个小型 bug fix、每任务3次重复；A 已达到100%隐藏测试通过率。上述数据仅描述本轮任务，不作为跨模型排名或显著性结论。

## 选型与隔离

采用宿主 TRAE CLI 0.211.1（internal）调用模型、容器内 exec-server 执行工具的方案①。只有 task 工作目录、只读 CLI 二进制和 C 的只读 ub-mode 目录进入 executor；gold 和鉴权目录未挂载。executor 使用 internal 网络、普通 uid、资源限制和无额外 capabilities，评分容器使用 --network=none。S1 原生读写和出网探针的证据在 `reports/overnight/S1-decision.md`。

本机 CLI 会在干净 TRAE_HOME 之外扫描宿主原生 skills，因此每次调用都用独立配置显式禁用非预期 skill，再检查最终上下文。A 必须为空；C 必须只有 ub-mode，并具有读取完整 SKILL.md 的工具事件。memories、plugins、bundled skills、web search 和 commit attribution 均在独立配置中禁用。

鉴权只有宿主可以刷新。每个 run 检查 expires_at，低于 40 分钟时串行执行最小宿主调用，让宿主刷新。已验证宿主自动刷新成功；54个正式 run 之后的最小宿主调用也成功，CLI 仍为0.211.1 internal，证据 `reports/overnight/host-final-acceptance.json`。凭证没有进入容器。

## 任务与来源（待用户审核）

| task | issue 方向 | 来源 PR | 修复提交时间 |
| --- | --- | --- | --- |
| url-base-slashes | 移除 URL base 后的重复前导斜杠导致协议相对地址 | https://github.com/unjs/ufo/pull/335 | 2026-04-29 |
| defaults-safe-copy | JSON 默认值合并的原型污染 | https://github.com/unjs/defu/pull/156 | 2026-04-01 UTC |
| path-network-root | resolve 丢失 UNC 网络根 | https://github.com/unjs/pathe/pull/246 | 2026-07-08 |

三个仓库均为 TypeScript/Vitest，源码修复小于 150 行，许可证 MIT。 交付的 setup.sh 从已提交的 base.tar.gz 恢复 fixture，三份归档与本次评测使用目录逐文件 SHA256 一致，证据 `reports/overnight/archived-setup-parity.json`。保留原始源码和 base 可见测试；没有 AST 改名。Git 历史、CHANGELOG、.github 和 PR 标识从 agent fixture 中移除。隐藏测试由来源 PR 更新的测试文件覆盖提供，内容只存在本地 gold。本报告不展示 hidden tests 内容。

| task | base 可见测试通过 | base hidden 回归失败 | 修复后可见通过 | 修复后 hidden 通过 |
| --- | ---: | ---: | ---: | ---: |
| url-base-slashes | 485 | 4 | 485 | 36 |
| defaults-safe-copy | 22 | 1 | 22 | 20 |
| path-network-root | 457 | 10 | 457 | 379 |

每项均在 --network=none 下验证；UNC证据 `reports/overnight/S2-validation.json`，修正依赖后的两个任务证据 `reports/overnight/repaired-S2-validation.json`。已克隆的官方 CHANGELOG 明确链接 ufo #335 和 defu #156，补充证据 `reports/overnight/sources/git-changelog-links.json`。LIMITED：PR 网页和 REST 当前受超时/共享出口限流影响，来源依据已克隆的真实 squash commit、父提交和 source/test diff；上表是提交时间，未冒充独立验证过的 PR merge 时间。

## 执行口径

A 的 agent 执行器不加载 skill；C 以 `/ub-mode` 开头，加载 ub-mode，并预装 crapper/dryer/mutator。两组的外部评分均使用同一个对应任务 gates 镜像。因此 C−A 对应这套 skill 与工具组合的效果。

只比较同一模型的 C−A；不对模型横向排名。

| 模型 | reasoning | harness | tool mode |
| --- | --- | --- | --- |
| GPT-6.1-Sol | xhigh | codex | code_mode_only |
| GPT-5.6-Luna | xhigh | codex | code_mode_only |
| DeepSeek-V4.1-Flash | high | claudecode | deferred_code_mode |

远端目录证据 `reports/overnight/effective-model-catalog.json`。GPT 和 DeepSeek 的 system prompt、工具集不同，这是实验条件差异。seed 是独立重复运行编号，CLI 没有设置 provider RNG seed 的参数。模型可能事先接触过开源代码；这次隔离验证针对运行时查找参照，并不能证明训练语料未包含这些修复。

upstream 固定版本：ub-mode 57a8bdd、crapper 6fd92c4、dryer 66ff6d2、mutator a5a0cb8。Node 22.16.0 已验证官方 SHA256。grammar Python 包为 1.22.1，三种 parser 从固定源提交编译并随镜像交付，runtime 不下载 grammar。 交付时公开测试 shell helper 已去除旧 `.bench_public_tests.sh` 依赖，五个 helper 使用宿主 uid:gid，断网检查证据在 `reports/overnight/gate-helper-checks.json`；正式批次走原始 runner 直接调用路径。

评分只覆盖从 benchmark base 到最终工作状态改动的文件，包含未提交和新增文件。CRAP 阈值 10、重复度阈值 0.8。外部 mutation 评分上限 20 分钟，超时/无法运行记 null 并写原因。第一个 commit 为失败测试必须同时满足只改测试、该 commit 上这些测试确实失败、最终状态中相同测试确实通过。


CRAP 分数反映整个改动文件中的函数。URL 任务的最大值均为 23，来自 `utils.ts` 中的 `joinRelativeURL`；UNC 首个 A 的最大值约 20，来自 `_path.ts` 中的 `normalizeString`。目标函数变简单时，文件最大值可能保持原值。这里保留 HANDOFF 指定的改动文件口径，证据在各 run 的 `crapper.log` 与 `gate-metrics/crap.edn`。

## 依赖参照隔离修正

后续审计发现，原始镜像内的 `ufo@1.6.4` 和 `defu@6.1.7` 已含目标修复，且六个正式 run 的事件流出现直接访问发布实现。前期只检查了源码 fixture 和出网限制，漏查了这条离线参照路径。原 ufo/defu 两个任务的 36 个正式结果及 6 个 smoke 结果已隔离为无效，原始 result 和工具事件全部保留；它们不进入最终干净统计。证据 `reports/overnight/dependency-reference-audit.json` 和 `reports/overnight/reference-invalidation.json`。

修复前依赖已锁定为 ufo1.6.3/defu6.1.4，版本预检和运行时负向探针均通过；两个任务重新完成断网四阶段校验，证据 `reports/overnight/repaired-S2-validation.json`。追加共享全局 Node 包目录检查，未发现 ufo/defu 包副本或对应命名实现，证据 `reports/overnight/global-node-reference-audit.json`。第三轮干净 smoke 6/6 为 PASS_CANDIDATE，原始指标审计全部匹配；两个受影响任务的36个正式slot已一次性回放完成，全部有效。每个slot只执行了一次新尝试，关闭自动基础设施重试；已核对归档原始SHA并幂等合并尝试数，均为原1+新1=2，证据 `reports/overnight/formal-replay-attempt-receipt.json` 和 `reports/overnight/smoke-replay-attempt-receipt.json`。原 UNC 镜像中的 `pathe@2.0.3` 仍返回错误的单斜杠根，不含目标修复；原 UNC 18个run全部保留，回放前后result哈希一致，证据 `reports/overnight/pathe-reference-baseline.json`。本次回放沿用相同任务、prompt、hidden tests、模型、effort与harness，执行器仍为internal网络、评分仍为network=none。

## Smoke

6/6 个终态，6 个有效。

| 模型 | 变体 | valid | hidden | CRAP max | 重复对 | mutation survivors | 首 commit 为失败测试 |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| DeepSeek-V4.1-Flash | A | true | true | 23 | 0 | 3 | false |
| DeepSeek-V4.1-Flash | C | true | true | 23 | 0 | 2 | false |
| GPT-5.6-Luna | A | true | true | 23 | 0 | 3 | false |
| GPT-5.6-Luna | C | true | true | 23 | 0 | 3 | false |
| GPT-6.1-Sol | A | true | true | 23 | 0 | 1 | false |
| GPT-6.1-Sol | C | true | true | 23 | 0 | 1 | false |

完整 smoke 结果、skill 读取事件和网络探针在 `runs/smoke/`。验收摘要在 `reports/overnight/smoke-acceptance.json`。

| 模型 | smoke 指标 | A 均值 (n) | C 均值 (n) | C−A |
| --- | --- | ---: | ---: | ---: |
| DeepSeek-V4.1-Flash | public_tests_passed | 1 (1) | 1 (1) | 0 |
| DeepSeek-V4.1-Flash | hidden_tests_passed | 1 (1) | 1 (1) | 0 |
| DeepSeek-V4.1-Flash | crap_max | 23 (1) | 23 (1) | 0 |
| DeepSeek-V4.1-Flash | crap_mean | 3.8703 (1) | 3.8703 (1) | 0 |
| DeepSeek-V4.1-Flash | dup_pairs_over_threshold | 0 (1) | 0 (1) | 0 |
| DeepSeek-V4.1-Flash | mutation_survivors | 3 (1) | 2 (1) | -1 |
| DeepSeek-V4.1-Flash | code_diff_lines | 2 (1) | 2 (1) | 0 |
| DeepSeek-V4.1-Flash | commits | 0 (1) | 0 (1) | 0 |
| DeepSeek-V4.1-Flash | first_commit_is_failing_test | 0 (1) | 0 (1) | 0 |
| DeepSeek-V4.1-Flash | wallclock_ms | 64141.1664 (1) | 123418.3155 (1) | 59277.1491 |
| GPT-5.6-Luna | public_tests_passed | 1 (1) | 1 (1) | 0 |
| GPT-5.6-Luna | hidden_tests_passed | 1 (1) | 1 (1) | 0 |
| GPT-5.6-Luna | crap_max | 23 (1) | 23 (1) | 0 |
| GPT-5.6-Luna | crap_mean | 3.9036 (1) | 3.8703 (1) | -0.0333 |
| GPT-5.6-Luna | dup_pairs_over_threshold | 0 (1) | 0 (1) | 0 |
| GPT-5.6-Luna | mutation_survivors | 3 (1) | 3 (1) | 0 |
| GPT-5.6-Luna | code_diff_lines | 4 (1) | 2 (1) | -2 |
| GPT-5.6-Luna | commits | 0 (1) | 0 (1) | 0 |
| GPT-5.6-Luna | first_commit_is_failing_test | 0 (1) | 0 (1) | 0 |
| GPT-5.6-Luna | wallclock_ms | 58007.6806 (1) | 140905.0128 (1) | 82897.3323 |
| GPT-6.1-Sol | public_tests_passed | 1 (1) | 1 (1) | 0 |
| GPT-6.1-Sol | hidden_tests_passed | 1 (1) | 1 (1) | 0 |
| GPT-6.1-Sol | crap_max | 23 (1) | 23 (1) | 0 |
| GPT-6.1-Sol | crap_mean | 3.8703 (1) | 3.8703 (1) | 0 |
| GPT-6.1-Sol | dup_pairs_over_threshold | 0 (1) | 0 (1) | 0 |
| GPT-6.1-Sol | mutation_survivors | 1 (1) | 1 (1) | 0 |
| GPT-6.1-Sol | code_diff_lines | 2 (1) | 2 (1) | 0 |
| GPT-6.1-Sol | commits | 0 (1) | 0 (1) | 0 |
| GPT-6.1-Sol | first_commit_is_failing_test | 0 (1) | 0 (1) | 0 |
| GPT-6.1-Sol | wallclock_ms | 72150.2635 (1) | 152567.0474 (1) | 80416.7839 |

smoke 每组仅一个样本；此表用于验证流程。原始向量与 CSV 在 `reports/overnight/smoke/`。

## 正式结果

54/54 个终态；有效 54/54。状态 PASS_CANDIDATE。

每行在同一个模型内计算 C−A。布尔指标按 0/1 计算均值；n 只统计该指标的非 null 有效样本。表内数值最多显示四位小数，全精度值保留在 JSON/CSV。

每个变体每模型为3个任务×3次重复，未作显著性检验。C−A 是非 null 组均值之差；当 n 不同时，不能当作完整配对差。diff、commit 数和用时描述改动量及过程成本。

本报告和交付 CSV 的改动量统一使用 `code_diff_lines`，仅计 `src/` 的新增＋删除行。正式54次与试跑6次均已从保留工作区逐文件核对，证据在 `reports/overnight/line-split-audit.json`。质量验收指标沿用原测量结果。

| 模型 | 指标 | A 均值 (n) | C 均值 (n) | C−A |
| --- | --- | ---: | ---: | ---: |
| DeepSeek-V4.1-Flash | public_tests_passed | 1 (9) | 1 (9) | 0 |
| DeepSeek-V4.1-Flash | hidden_tests_passed | 1 (9) | 1 (9) | 0 |
| DeepSeek-V4.1-Flash | crap_max | 19.7885 (9) | 17.2234 (9) | -2.5652 |
| DeepSeek-V4.1-Flash | crap_mean | 6.2431 (9) | 4.984 (9) | -1.2591 |
| DeepSeek-V4.1-Flash | dup_pairs_over_threshold | 0 (9) | 0 (9) | 0 |
| DeepSeek-V4.1-Flash | mutation_survivors | 1.3333 (9) | 0.5 (8) | -0.8333 |
| DeepSeek-V4.1-Flash | code_diff_lines | 16.1111 (9) | 28.2222 (9) | 12.1111 |
| DeepSeek-V4.1-Flash | commits | 0 (9) | 0 (9) | 0 |
| DeepSeek-V4.1-Flash | first_commit_is_failing_test | 0 (9) | 0 (9) | 0 |
| DeepSeek-V4.1-Flash | wallclock_ms | 214199.6232 (9) | 575596.0765 (9) | 361396.4533 |
| GPT-5.6-Luna | public_tests_passed | 1 (9) | 1 (9) | 0 |
| GPT-5.6-Luna | hidden_tests_passed | 1 (9) | 1 (9) | 0 |
| GPT-5.6-Luna | crap_max | 19.0034 (9) | 17.6701 (9) | -1.3333 |
| GPT-5.6-Luna | crap_mean | 5.8847 (9) | 4.9912 (9) | -0.8935 |
| GPT-5.6-Luna | dup_pairs_over_threshold | 0 (9) | 0 (9) | 0 |
| GPT-5.6-Luna | mutation_survivors | 0.4444 (9) | 0.7778 (9) | 0.3333 |
| GPT-5.6-Luna | code_diff_lines | 3.4444 (9) | 19.6667 (9) | 16.2222 |
| GPT-5.6-Luna | commits | 0 (9) | 0 (9) | 0 |
| GPT-5.6-Luna | first_commit_is_failing_test | 0 (9) | 0 (9) | 0 |
| GPT-5.6-Luna | wallclock_ms | 95662.6805 (9) | 416540.7277 (9) | 320878.0473 |
| GPT-6.1-Sol | public_tests_passed | 1 (9) | 1 (9) | 0 |
| GPT-6.1-Sol | hidden_tests_passed | 1 (9) | 1 (9) | 0 |
| GPT-6.1-Sol | crap_max | 19.0023 (9) | 17.3367 (9) | -1.6655 |
| GPT-6.1-Sol | crap_mean | 5.8888 (9) | 5.0575 (9) | -0.8313 |
| GPT-6.1-Sol | dup_pairs_over_threshold | 0 (9) | 0 (9) | 0 |
| GPT-6.1-Sol | mutation_survivors | 0.7778 (9) | 0.5556 (9) | -0.2222 |
| GPT-6.1-Sol | code_diff_lines | 3.7778 (9) | 16.2222 (9) | 12.4444 |
| GPT-6.1-Sol | commits | 0 (9) | 0.2222 (9) | 0.2222 |
| GPT-6.1-Sol | first_commit_is_failing_test | 0 (9) | 0 (9) | 0 |
| GPT-6.1-Sol | wallclock_ms | 104138.441 (9) | 238179.2748 (9) | 134040.8338 |

每次正式运行的交付明细在 `reports/overnight/formal/source-only.csv`，改动量只列业务源码行数。`reports/overnight/formal/aggregate.json` 保存测量汇总，报告按上述源码口径展示。

`wallclock_ms` 为 executor 准备与 agent 模型/工具阶段用时，外部评分不在该指标内。mutation 另有 20 分钟上限，正式 run 的剩余 30 分钟总预算也限制外部测试和评分。

<details><summary>每个正式 seed 的原始自动指标</summary>

| 模型 | task | 变体 | seed | valid | public | hidden | CRAP max | CRAP mean | 重复对 | survivors | 源码改动行数 | commits | 首 commit 为失败测试 | agent ms |
| --- | --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| DeepSeek-V4.1-Flash | defaults-safe-copy | A | 1 | true | true | true | 16 | 8.5 | 0 | 3 | 17 | 0 | false | 461893.0247 |
| DeepSeek-V4.1-Flash | defaults-safe-copy | A | 2 | true | true | true | 19.0969 | 10.0485 | 0 | 2 | 22 | 0 | false | 375793.4522 |
| DeepSeek-V4.1-Flash | defaults-safe-copy | A | 3 | true | true | true | 14 | 6.3333 | 0 | 3 | 23 | 0 | false | 242889.3499 |
| DeepSeek-V4.1-Flash | defaults-safe-copy | C | 1 | true | true | true | 8 | 4.2 | 0 | 0 | 64 | 0 | false | 510087.2314 |
| DeepSeek-V4.1-Flash | defaults-safe-copy | C | 2 | true | true | true | 9 | 5.25 | 0 | 0 | 58 | 0 | false | 664257.3031 |
| DeepSeek-V4.1-Flash | defaults-safe-copy | C | 3 | true | true | true | 9 | 5.8 | 0 | 0 | 55 | 0 | false | 458024.7796 |
| GPT-5.6-Luna | defaults-safe-copy | A | 1 | true | true | true | 14 | 7.5 | 0 | 1 | 2 | 0 | false | 128823.0069 |
| GPT-5.6-Luna | defaults-safe-copy | A | 2 | true | true | true | 14 | 7.5 | 0 | 1 | 2 | 0 | false | 65001.2908 |
| GPT-5.6-Luna | defaults-safe-copy | A | 3 | true | true | true | 14 | 7.5 | 0 | 1 | 8 | 0 | false | 171116.8764 |
| GPT-5.6-Luna | defaults-safe-copy | C | 1 | true | true | true | 7 | 4.25 | 0 | 0 | 72 | 0 | false | 267633.6169 |
| GPT-5.6-Luna | defaults-safe-copy | C | 2 | true | true | true | 14 | 7.5 | 0 | 0 | 2 | 0 | false | 300231.3498 |
| GPT-5.6-Luna | defaults-safe-copy | C | 3 | true | true | true | 9 | 3.1667 | 0 | 0 | 79 | 0 | false | 428847.4561 |
| GPT-6.1-Sol | defaults-safe-copy | A | 1 | true | true | true | 14 | 7.5 | 0 | 1 | 3 | 0 | false | 96737.4618 |
| GPT-6.1-Sol | defaults-safe-copy | A | 2 | true | true | true | 14 | 7.5 | 0 | 1 | 3 | 0 | false | 111407.6805 |
| GPT-6.1-Sol | defaults-safe-copy | A | 3 | true | true | true | 14 | 7.5 | 0 | 1 | 3 | 0 | false | 138689.5964 |
| GPT-6.1-Sol | defaults-safe-copy | C | 1 | true | true | true | 9 | 5.3333 | 0 | 0 | 31 | 0 | false | 215052.0612 |
| GPT-6.1-Sol | defaults-safe-copy | C | 2 | true | true | true | 9 | 5.3333 | 0 | 0 | 27 | 0 | false | 270451.8074 |
| GPT-6.1-Sol | defaults-safe-copy | C | 3 | true | true | true | 9 | 5.3333 | 0 | 0 | 31 | 0 | false | 216509.4705 |
| DeepSeek-V4.1-Flash | path-network-root | A | 1 | true | true | true | 20 | 6.677 | 0 | 0 | 46 | 0 | false | 303180.0927 |
| DeepSeek-V4.1-Flash | path-network-root | A | 2 | true | true | true | 20 | 6.5114 | 0 | 0 | 15 | 0 | false | 130920.4768 |
| DeepSeek-V4.1-Flash | path-network-root | A | 3 | true | true | true | 20 | 6.4401 | 0 | 0 | 12 | 0 | false | 222815.6585 |
| DeepSeek-V4.1-Flash | path-network-root | C | 1 | true | true | true | 20.0102 | 6.0101 | 0 | 0 | 28 | 0 | false | 383835.3746 |
| DeepSeek-V4.1-Flash | path-network-root | C | 2 | true | true | true | 20 | 6.1594 | 0 | 0 | 15 | 0 | false | 607523.4301 |
| DeepSeek-V4.1-Flash | path-network-root | C | 3 | true | true | true | 20 | 5.7588 | 0 | null | 24 | 0 | false | 1177092.428 |
| GPT-5.6-Luna | path-network-root | A | 1 | true | true | true | 20.0102 | 6.2965 | 0 | 0 | 5 | 0 | false | 95405.5525 |
| GPT-5.6-Luna | path-network-root | A | 2 | true | true | true | 20.0102 | 6.2965 | 0 | 0 | 4 | 0 | false | 95716.1435 |
| GPT-5.6-Luna | path-network-root | A | 3 | true | true | true | 20.0102 | 6.2251 | 0 | 0 | 4 | 0 | false | 79539.1985 |
| GPT-5.6-Luna | path-network-root | C | 1 | true | true | true | 20.0102 | 6.2251 | 0 | 0 | 4 | 0 | false | 569514.7191 |
| GPT-5.6-Luna | path-network-root | C | 2 | true | true | true | 20.0102 | 5.9434 | 0 | 0 | 10 | 0 | false | 381832.5478 |
| GPT-5.6-Luna | path-network-root | C | 3 | true | true | true | 20.0102 | 6.2251 | 0 | 0 | 4 | 0 | false | 265710.0226 |
| GPT-6.1-Sol | path-network-root | A | 1 | true | true | true | 20.0102 | 6.2965 | 0 | 0 | 7 | 0 | false | 126976.1737 |
| GPT-6.1-Sol | path-network-root | A | 2 | true | true | true | 20.0102 | 6.3679 | 0 | 0 | 6 | 0 | false | 134881.9704 |
| GPT-6.1-Sol | path-network-root | A | 3 | true | true | true | 20 | 6.2243 | 0 | 0 | 4 | 0 | false | 135333.8124 |
| GPT-6.1-Sol | path-network-root | C | 1 | true | true | true | 20.0102 | 5.8101 | 0 | 0 | 18 | 1 | false | 324557.5225 |
| GPT-6.1-Sol | path-network-root | C | 2 | true | true | true | 20.0102 | 6.1536 | 0 | 0 | 11 | 0 | false | 325894.7033 |
| GPT-6.1-Sol | path-network-root | C | 3 | true | true | true | 20.0102 | 5.9434 | 0 | 0 | 21 | 1 | false | 323195.7837 |
| DeepSeek-V4.1-Flash | url-base-slashes | A | 1 | true | true | true | 23 | 3.8703 | 0 | 1 | 3 | 0 | false | 78316.4597 |
| DeepSeek-V4.1-Flash | url-base-slashes | A | 2 | true | true | true | 23 | 3.9036 | 0 | 1 | 3 | 0 | false | 55612.7066 |
| DeepSeek-V4.1-Flash | url-base-slashes | A | 3 | true | true | true | 23 | 3.9036 | 0 | 2 | 4 | 0 | false | 56375.3878 |
| DeepSeek-V4.1-Flash | url-base-slashes | C | 1 | true | true | true | 23 | 3.9036 | 0 | 1 | 6 | 0 | false | 314281.0107 |
| DeepSeek-V4.1-Flash | url-base-slashes | C | 2 | true | true | true | 23 | 3.8703 | 0 | 1 | 2 | 0 | false | 496114.9913 |
| DeepSeek-V4.1-Flash | url-base-slashes | C | 3 | true | true | true | 23 | 3.9036 | 0 | 2 | 2 | 0 | false | 569148.1401 |
| GPT-5.6-Luna | url-base-slashes | A | 1 | true | true | true | 23 | 3.8703 | 0 | 1 | 2 | 0 | false | 73644.4889 |
| GPT-5.6-Luna | url-base-slashes | A | 2 | true | true | true | 23 | 3.9036 | 0 | 0 | 2 | 0 | false | 88235.468 |
| GPT-5.6-Luna | url-base-slashes | A | 3 | true | true | true | 23 | 3.8703 | 0 | 0 | 2 | 0 | false | 63482.0988 |
| GPT-5.6-Luna | url-base-slashes | C | 1 | true | true | true | 23 | 3.8703 | 0 | 2 | 2 | 0 | false | 642834.1729 |
| GPT-5.6-Luna | url-base-slashes | C | 2 | true | true | true | 23 | 3.8703 | 0 | 2 | 2 | 0 | false | 708662.6123 |
| GPT-5.6-Luna | url-base-slashes | C | 3 | true | true | true | 23 | 3.8703 | 0 | 3 | 2 | 0 | false | 183600.0521 |
| GPT-6.1-Sol | url-base-slashes | A | 1 | true | true | true | 23 | 3.8703 | 0 | 2 | 2 | 0 | false | 69676.2532 |
| GPT-6.1-Sol | url-base-slashes | A | 2 | true | true | true | 23 | 3.8703 | 0 | 1 | 2 | 0 | false | 66111.5915 |
| GPT-6.1-Sol | url-base-slashes | A | 3 | true | true | true | 23 | 3.8703 | 0 | 1 | 4 | 0 | false | 57431.4294 |
| GPT-6.1-Sol | url-base-slashes | C | 1 | true | true | true | 23 | 3.8703 | 0 | 0 | 2 | 0 | false | 154252.7981 |
| GPT-6.1-Sol | url-base-slashes | C | 2 | true | true | true | 23 | 3.8703 | 0 | 4 | 2 | 0 | false | 186548.4273 |
| GPT-6.1-Sol | url-base-slashes | C | 3 | true | true | true | 23 | 3.8703 | 0 | 1 | 3 | 0 | false | 127150.8992 |

</details>

## 诊断 run 与限制

S3 的 manual-v1–v4 均属于基础设施诊断，不进入 smoke/formal 样本：分别识别 executor home 缺失、原生 skill 别名解析遗漏、stdin EOF 缺失和 executor 启动 readiness 竞态。已修复，manual-v5 的真实 A 调用完成且 visible/hidden tests 通过。后续 smoke 修复了 DeepSeek 的 skill 目录外层提示格式差异，仅替换那一个预检无效样本；第二轮曾完成6/6流程验收，后来因依赖参照泄漏统一隔离；第三轮干净6/6已重新验收。

旧 grammar 0.10.0 不支持固定 upstream 的 download API。已改为兼容版本和随镜像交付的本地 parser，断网集成 fixture 得到 CRAP 1、重复度 0、mutation 2 killed/0 survived。早期 manual-v5 评分中的 null 为旧 grammar 诊断结果，不用于正式比较。

## 需要重跑或审核

本轮没有需要自动重跑的正式slot。用户审核任务来源和prompt，被否掉的任务按HANDOFF另行重跑。UNC DeepSeek C3 的mutation若需补测，应记录为独立补充实验，保留本轮null，不覆盖原始结果；本轮按要求保留有效UNC18，不再重跑。最终PASS只由用户给出。

LIMITED：三个PR的merge时间仍未独立核验（公开页/REST受访问限制，后续公开索引也无结果），已明确使用提交时间；一项mutation因预算上限为null。没有BLOCKED项。

## 分支与清理

早期交付分支为 `overnight-2026-10-29`，代码与结果提交为 `1fec887eefbaad55ebf01424f262a68be85bab09`。UTC 2026-10-29T01:46:07.939425+00:00 已核对远端与本地提交一致；基准分支未改变。

推送时旧转发SSH agent在请求身份列表时阻塞；使用同一用户拥有且可响应的现有agent与个人GitHub key恢复，GitHub官方SSH443通道沿用已知主机密钥严格校验。该覆盖仅作用于本次命令，未改全局配置。证据 `reports/overnight/code-push.log` 和 `reports/overnight/code-remote-after-submit.txt`。

UTC 2026-10-29T01:30:07.471148+00:00 已确认benchmark容器为0、运行时auth symlink为0，空的 `ubm-internal` 网络已删除；没有保留运行容器或benchmark网络。证据 `reports/overnight/cleanup.json`。

保留12个 `ub-mode-bench/*` 镜像标签、`gold/`、`runs/smoke/`、`runs/formal/`、`reports/overnight/`（含原36formal+6smoke隔离归档、原始日志、resolved locks与审计）、`docker/vendor/` wheels/parsers和 `/tmp/ubm-upstream/` 固定工具源，供用户抽查和后续复现。旧URL/default镜像标签只保留作污染对照；当前任务定义使用 `-no-reference` 与 `-no-reference-gates` 标签。gold、runs和报告证据子目录均不进入本次提交。

最终source检查：`pnpm lint` 和9个测试通过；54项原始测试、EDN、mutation Total、Git diff/commit、完整skill读取、网络/mount、symlink及ignore-file核对一致，aggregate的均值/n/原始向量独立重算一致。证据 `reports/overnight/S6-lint.log`、`reports/overnight/S6-tests.log`、`reports/overnight/raw-artifact-audit.json`、`reports/overnight/formal-acceptance.json`。


## 无效与 null 项

最终canonical smoke/formal无效run：0，全部已终态。另有42个隔离归档结果：URL/default两个任务、所有3模型×A/C×seed1–3的36formal，加原URL smoke6，原因统一为镜像提供了含目标修复的发布依赖；均从本轮统计排除。原始结果及失效标记在 `reports/overnight/reference-quarantine/`，完整slot清单在 `reports/overnight/reference-invalidation.json`。

- path-network-root--DeepSeek-V4.1-Flash--C--3: {"mutation_survivors":"mutation reached its 20-minute cap or the remaining 30-minute run deadline"}

阶段诊断 manual-v1–v4 不属于实验样本，不与正式无效 run 混算。mutator 的正常 survivor 退出码为 3；smoke 早期解析遗漏已按原始完整 Total 日志修正，并保存修正前 result。
