# 架构

Univer CLI 是一个单一 Lite target 的本地 application。npm package 名为 `univer-cli`，唯一 program/bin 为
`univer`。`apps/cli` 负责 application composition，`packages/*` 提供不对用户单独发布的本地支撑能力。

## 分层

```text
univer process
  -> Commander composition root
       -> Univer CLI SDK command preset
            -> Univer CLI SDK capability
       -> local command adapter
            -> application use case
                 -> Univer SDK
                 -> Collaboration SDK
                 -> local storage, process or browser adapter
```

- CLI SDK capability 是 target-neutral 的业务能力，可脱离本 application 使用。
- CLI SDK command preset 是原生 Commander `Command`，负责 argv、help 和 presentation。
- local command adapter 把路径、环境变量、Application home 和本地输出映射到 capability input/output。
- application use case 协调本地文件、daemon、Gateway、browser 与 SDK，不复制 SDK 内部规则。
- composition root 是唯一装配位置；仓库不建立额外 command registry framework 或 IoC container。

## SDK 边界

### Univer SDK

Univer SDK 提供 Unit 数据模型、Facade、formula、render engine、Sheet、Doc、Slide、Base、Board 及其 UI/runtime
plugin。application 和 browser composition 只通过已发布 package 与 API 使用这些能力，不读取其他 checkout
或复制 SDK 源码。

### Collaboration SDK

Collaboration SDK 提供 changeset、Snapshot、Worktree persistence contract、Service、Endpoint、Transport、
browser client 和 runtime integration。`packages/collab-gateway` 与
`packages/univerfile-sqlite` 实现本地 transport 和 database adapter，但不重新定义 SDK 的协作语义。

### Univer CLI SDK

Univer CLI SDK 提供 target-neutral capability、Commander preset、daemon control、content execution、content
inspection、unit exchange、layout lint、screenshot、SVG/Typst facade、resource library、configuration、API
reference，以及 collaboration runtime/pool。`apps/cli` 负责组合这些 package，并为它们提供 Local adapter。

### Application-owned capability

本仓库只拥有无法放入 target-neutral SDK 的本地语义：

- `.univer` path normalization、格式识别、安全升级和 SQLite connection lifecycle；
- `${UNIVER_HOME:-~/.univer}`、config path、browser cache 与 daemon socket；
- daemon identity、Gateway address mapping、runtime worker 和本地进程生命周期；
- HTTP(S) import 下载、临时文件与 credential-safe error；
- browser runtime 的构建、复制和本地图片投影；
- application Skill assets、诊断信息与脱敏规则。

只有出现第二个真实 adapter 时才新增 port；测试替身本身不构成 architecture seam。

## Runtime topology

```text
univer command
  -> application daemon
       -> Collaboration Gateway
            -> one GatewayFileRuntime per opened .univer
                 -> Collaboration SDK services
                 -> @univer/univerfile-sqlite adapters
       -> CLI SDK runtime worker pool
            -> headless Univer runtime worker

univer open
  -> Gateway-hosted Viewer
       -> Collaboration SDK browser client

univer screenshot / lint / compile-svg
  -> CLI SDK browser orchestration
       -> packaged render-runtime-client
            -> Univer SDK render composition
```

daemon 只管理本地服务和 runtime lifecycle。它为 render operation 物化 UnitData、解析同文件依赖并投影本地
图片资产；PNG 输出、layout analysis 和文本测量由 CLI SDK capability 与 browser runtime 完成。

## Source ownership

`apps/cli/src/program.ts` 是 composition root。源码按用户能力划分为 `univerfile`、`exchange`、`optimize`、
`worktree`、`unit`、`unit-content`、`render`、`lint`、`svg`、`typst`、`doctor`、`skills` 和 `update`。
每个 feature 并置自己的 command、application service、handler 与私有 protocol；command handler 保持轻薄。

```text
apps/cli/src/environment/           # Home、config 与本地路径
apps/cli/src/daemon/                # daemon、Gateway 与 runtime composition
apps/cli/src/features/              # application feature 与 Local adapter
apps/cli/src/skills/                # build 随包发布的 Skill assets
apps/cli/src/runtime-worker.ts      # headless collaboration worker composition
packages/collab-gateway/            # Collaboration SDK Gateway adapter
packages/collab-gateway-contract/   # Gateway/Viewer control-plane contract
packages/collab-web/                # Collaboration browser application
packages/importrange-formula/       # cross-unit formula plugin
packages/render-preset/             # shared browser Univer composition
packages/render-runtime-client/     # machine browser runtime
packages/univerfile-sqlite/         # .univer persistence 与安全升级
```

Skill Markdown 是 application asset，保持在 `apps/cli/src/skills`；build 将其复制到 `dist/skills`，runtime 不读取
相邻目录。

## Command composition

根 help 使用 Commander 原生 `helpGroup()`，按 Univerfile、Data Exchange、Collaboration、Unit Operations、
Rendering、Authoring、Resources & Reference、Data Maintenance 与 System 展示。help group 是用户导航，不决定
源码 ownership。

公共 command、option、machine output、exit code 或数据合同变化必须同步更新测试与 README/docs。`--json`
成功时 stdout 只包含一个 command-specific JSON document；已识别 JSON 模式的失败在 stderr 输出一个 JSON
document 并以非零状态退出。

## Dependency rules

- Univer 能力只能来自 Univer SDK、Collaboration SDK 或 Univer CLI SDK 的正式 package/API。
- Workspace package 通过 `workspace:*` 依赖；application 不依赖相邻 checkout。
- 不复制 SDK 源码或其他 Univer repository implementation。
- SDK package 使用一致且精确的版本集合，由 workspace manifest、`.npmrc` 和 lockfile 管理。
- application build 记录真正留在 bundle 外部的 runtime dependency；release manifest 只包含该审计结果。
- Runtime development license 是 30 天轮换的运行凭据，与 repository software license 分离。

## Quality gate

```bash
pnpm check
```

质量门依次验证 format、lint、typecheck、build、workspace tests、built executable、Gateway/Viewer/runtime worker、
browser render smoke 和 package dry-run。
