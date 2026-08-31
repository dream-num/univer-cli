# 架构

Univer CLI 是一个单一 Lite application。npm package 名为 `univer-cli`，唯一 program/bin 为 `univer`。application 基于 Univer CLI SDK 开发：标准 command 与通用能力由 CLI SDK package 提供并随 application 安装，`apps/cli` 负责显式装配；业务和本地环境相关的 application-specific 能力由本仓库实现。

## 分层

```text
univer process
  -> Commander composition root
       -> CLI SDK standard feature
            -> command preset
            -> capability
       -> application-specific feature
            -> application use case
                 -> Univer SDK
                 -> Collaboration SDK
                 -> local storage, process or browser adapter
```

- CLI SDK standard feature 以 application dependency 的形式安装，并由 composition root 逐项注册。
- CLI SDK command preset 是原生 Commander `Command`，负责 argv、help 和 presentation；对应 capability 提供通用业务规则。
- application-specific feature 把路径、环境变量、Application home 和本地输出映射到 capability input/output，或实现本地产品独有的 use case。
- application use case 协调本地文件、daemon、Gateway、browser 与 SDK，不复制 SDK 实现。
- composition root 是唯一装配位置；仓库不建立额外 command registry framework 或 IoC container。

## SDK 边界

### Univer SDK

Univer SDK 提供 Unit 数据模型、Facade、formula、render engine、Office exchange、Sheet、Doc、Slide、Base、Board
及其 UI/runtime plugin。application 和 browser composition 只通过已发布 package 与 API 使用这些能力，不读取
其他 checkout 或复制 SDK 源码。

### Collaboration SDK

Collaboration SDK 提供 changeset、Snapshot、Worktree persistence contract、Service、Endpoint、Transport、
browser client 和 runtime integration。`packages/collab-gateway` 与
`packages/univerfile-sqlite` 实现本地 transport 和 database adapter，但不重新定义 SDK 的协作语义。

### Univer CLI SDK

Univer CLI SDK 提供标准 capability、Commander preset、daemon control、content execution、content inspection、layout lint、screenshot、SVG/Typst facade、resource library、configuration、API reference，以及 collaboration runtime/pool。这些 package 随 application 安装，`apps/cli` 在 composition root 中显式装配，并按需提供 application-specific adapter。

### Application-owned capability

本仓库实现业务和本地环境相关的 application-specific 能力：

- `.univer` path normalization、格式识别、安全升级和 SQLite connection lifecycle；
- `${UNIVER_HOME:-~/.univer}`、config path、browser cache 与 daemon socket；
- daemon identity、Gateway address mapping、runtime worker 和本地进程生命周期；
- HTTP(S) import 下载、临时文件与 credential-safe error；
- Exchange Node 的格式、公式、selector、错误与本地 Unit persistence 映射；
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
       -> read-only pinned Unit comparison (Trunk or Worktree <-> current Worktree)
       -> trunk-only Universer exchange tasks + all-scope print plugins

univer screenshot / lint / compile-svg
  -> CLI SDK browser orchestration
       -> packaged render-runtime-client
            -> CLI SDK univer-render-page
                 -> standard Univer SDK render composition
```

daemon 只管理本地服务和 runtime lifecycle。它为 render operation 物化 UnitData、解析同文件依赖并投影本地
图片资产；PNG 输出、layout analysis 和文本测量由 CLI SDK capability 与 browser runtime 完成。

Gateway 按 `.univer` runtime 隔离 Viewer Ribbon 使用的 `source=1` exchange 上传、异步 import/export task 与临时 artifact；导入在当前 trunk 创建新 Unit，导出物化 trunk head。Worktree 路径不暴露 exchange。嵌入资源继续使用按 Unit/worktree 授权的 `source=3` 文件协议，不能与 exchange artifact 混用。

Gateway 为 trunk revision 组合 Collaboration SDK History Service 与 Endpoint。`@univer/univerfile-sqlite` 在共享文件 connection 上实现 History persistence contract；History 表只是由 core Unit/changeset 重建的派生索引。每个文件 runtime 启动时先把索引 reconcile 到 trunk head，再开放 SDK transport。Viewer 按 Unit 类型为 trunk Sheet、Doc、Slide、Base 和 Board 注册各自的标准 SDK History UI 插件；Worktree 与 merge preview 不呈现这项能力。

Viewer 的 Unit comparison 在创建时固定左右 ref、Unit 集合和各自 head。Gateway 通过 Collaboration SDK
把每侧物化为最终 snapshot；history 连续时同时返回从共同 Trunk revision 到两侧 head 的 changeset path，
否则显式降级为 snapshot fidelity。比较只读且不生成 mutation。语义计算归属 Univer Pro 的现有 History
模块，由其 Facade 和可复用 service 提供，不依赖 CLI SDK。Sheet 的双侧 changeset 坐标对齐、Doc 的段落
与文字对齐，以及 Slide、Base、Board 的稳定 ID/属性差异均由 SDK 计算。后续 head 或 Unit presence 变化只将 session 标为
stale，不会改变已固定的结果。

Sheet 公式原文显示由应用通过已发布 SDK 的 `SheetInterceptorService` 与 `FormulaDataModel` 实现，
适配器返回可释放的渲染覆盖。Viewer 同步两侧的开关状态，
不改写 snapshot、mutation 或公式结果，也不为显示切换重建 Unit。此显示能力不属于 History 的语义差异计算。

同一 session 通过 `WorktreeControlClient.getUnitComparisonContext()` 和对应的 `/diff` route 暴露
`schemaVersion: 1` 的 UI-independent context。Gateway 只在首次请求时准备 pinned diff，之后在同一固定结果上做
filter、search 与 paging。item 使用统一的 insert/delete/update 语义、稳定 ID/path、左右 location；内部
`changes` 再以相对语义 path、value type、before/after 和可选文本/公式 segment 描述 leaf difference。
`summary | changes | full` projection 只改变 payload 详情，不改变 item identity。Compare UI 的紧凑差异导航
直接消费同一 changes 语义；coverage 与 diagnostics 明确声明当前 product family 支持范围和降级原因。这个
contract 是 CLI SDK / Agent 入口的复用边界，不能从 Viewer DOM 反向提取差异。Doc 对齐行和普通 item
分别分页；Sheet 用紧凑行列区间返回映射，避免按整张表的尺寸展开。物化状态在 session 内共享，向消费者
返回副本，防止解码或展示阶段影响后续分页。应用只映射 i18n、树形菜单、原生画布着色与联动，不重复计算差异。

headless collaboration runtime 只拥有一个可写 Host Unit。Embed 遇到 `self` ResourceRef 时，application-owned
Local provider 通过当前 `.univer` 与 Worktree 已限定的 Snapshot endpoint 按需物化 child Unit，并透传 Embed
child create options；child 只作为同一 Univer instance 中的只读依赖，不进入 Host 的 changeset 状态机，也不触发
Worktree 全量 Unit 预加载。

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
packages/render-runtime-client/     # CLI SDK Render Page bundle entry
packages/unit-compare/              # 私有 Compare 展示类型与页签投影；不计算语义差异
packages/univerfile-sqlite/         # .univer persistence 与安全升级
packages/workbook-compare/          # Sheet 只读展示和坐标联动；仅消费 Pro History 的差异与对齐结果，无算法回退
```

Skill Markdown 是 application asset，保持在 `apps/cli/src/skills`；build 将其复制到 `dist/skills`，runtime 不读取
相邻目录。`discovery/univer-cli` 同时是对外 discovery Skill 的唯一 source；正式 stable latest release
将它自动同步到 `dream-num/skills` distribution mirror。`runtime/*` 只随 npm package 发布，确保操作指导与
已安装 application version 匹配。

## Command composition

根 help 使用 Commander 原生 `helpGroup()`，按 Univerfile、Data Exchange、Collaboration、Unit Operations、
Rendering、Authoring、Resources & Reference、Data Maintenance 与 System 展示。help group 是用户导航，不决定
源码 ownership。

公共 command、option、machine output、exit code 或数据合同变化必须同步更新测试与 README/docs。`--json`
成功时 stdout 只包含一个 command-specific JSON document；已识别 JSON 模式的失败在 stderr 输出一个 JSON
document 并以非零状态退出。

## Dependency rules

- 标准 CLI command 和通用 capability 由 Univer CLI SDK 提供并在 composition root 显式装配；不得在 application 中重复实现。
- application-specific 能力由本仓库实现，并通过 Univer SDK 与 Collaboration SDK 完成 runtime 和协作工作。
- Univer 能力只能来自 Univer SDK、Collaboration SDK 或 Univer CLI SDK 的正式 package/API。
- Workspace package 通过 `workspace:*` 依赖；application 不依赖相邻 checkout。
- 不复制 SDK 源码或其他 Univer repository implementation。
- SDK package 使用一致且精确的版本集合，由 workspace manifest、`.npmrc` 和 lockfile 管理。
- application build 记录真正留在 bundle 外部的 runtime dependency；release manifest 只包含该审计结果。
- Runtime development license 是 90 天轮换的运行凭据，与 repository software license 分离。

## Quality gate

```bash
pnpm check
```

质量门依次验证 format、lint、typecheck、locale freshness、build、workspace tests、built executable、
Gateway/Viewer/runtime worker、browser render smoke 和 package dry-run。
