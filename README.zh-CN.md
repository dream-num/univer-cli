# Univer CLI

[English](README.md)

在命令行中创建、编辑、检查、转换和渲染 Office 内容。

Univer CLI 面向 Coding Agent 与本地自动化工作流，通过唯一的 `univer` 命令操作 Sheet、Doc、Slide、Base 和 Board。内容保存在本地 `.univer` 文件中；修改可以在独立 Worktree 中完成、检查并合并，交互命令同时提供适合程序消费的 JSON 输出。

## 核心能力

- **创建与编辑**：创建 Univerfile 和 Unit，通过 Univer Facade 执行可信代码并提交变更。
- **结构化检查**：读取 Workbook、Worksheet、Range、Document、Paragraph、Presentation 和 Slide，而不是解析界面文本。
- **格式交换**：导入 XLS、XLSX、XLSM、CSV、TSV、DOC、DOCX、PPT 和 PPTX；导出 XLSX、CSV、TSV、DOCX 和 PPTX。
- **可审阅协作**：使用 Worktree 隔离修改，支持 `draft`、`ready`、`reopen`、`merge` 和 `discard` 生命周期。
- **真实渲染**：在浏览器 runtime 中生成截图，并对 Slide 执行基于实际 glyph geometry 的 layout lint。
- **Agent 接口**：提供稳定的 `--json` 输出、离线 API reference 和随版本发布的 operational Skills。
- **本地优先**：Univerfile、Gateway、Viewer、daemon 和 browser cache 均在本机运行。

## 快速开始

需要 Node.js 22.12 或更高版本，并使用仓库声明的 pnpm 版本。

```bash
pnpm install --frozen-lockfile
pnpm link:cli
univer --help
```

将现有 Office 文件导入 Univerfile，然后检查状态并在 Viewer 中打开：

```bash
univer import ./sales.univer --file ./sales.xlsx --json
univer status ./sales.univer --json
univer open ./sales.univer
```

Viewer 的 trunk Ribbon 同样支持把 Office 文件导入为当前 `.univer` 的新 Unit、导出 Sheet/Doc/Slide/Base，以及打印受支持的 Unit。trunk Sheet 还可查看按提交时间聚合的版本历史；只读 Viewer 只能查看，可编辑 Viewer 可以显式恢复为某个历史版本。只读 Sheet 中不提供保护和打印。Worktree 和 merge preview 不提供版本历史或导入导出；其他受支持的 Unit 仍可打印，Board 仅提供打印。

对内容的写操作在 draft Worktree 中完成：

```bash
univer worktree add ./sales.univer --name agent --json
univer execute ./sales.univer --worktree <worktree-id> --unit <unit-id> \
  -e 'workbook.getActiveSheet().getRange("A1").setValue("done");' --json
univer inspect range A1 ./sales.univer --worksheet name:Sheet1 \
  --unit <unit-id> --worktree <worktree-id> --json
univer worktree ready ./sales.univer --worktree <worktree-id>
univer worktree merge ./sales.univer --worktree <worktree-id>
```

## 命令概览

| 场景       | 命令                                   |
| ---------- | -------------------------------------- |
| Univerfile | `new`, `open`, `status`                |
| 数据交换   | `import`, `export`                     |
| 协作修改   | `worktree`, `unit`, `execute`          |
| 内容检查   | `inspect`                              |
| 渲染与质量 | `screenshot`, `lint`                   |
| 内容生成   | `compile-svg`, `compile-typst`         |
| 资源与参考 | `resources`, `api`, `skills`           |
| 数据维护   | `optimize`                             |
| 本地环境   | `config`, `doctor`, `daemon`, `update` |

完整的 command、option、selector、环境变量和 machine-output 合同见 [`apps/cli/README.md`](apps/cli/README.md)。也可以随时运行：

```bash
univer <command> --help
```

## 数据与安全

`.univer` 是包含内容 Unit、revision、Worktree、本地资源和可重建 History 索引的 SQLite container。新文件使用 v2 格式；受支持的 v0 和 v1 输入会通过只读识别、完整备份、独立 candidate 验证和原子替换升级，失败时不会覆盖源文件。完整合同见 [`docs/data-compatibility.md`](docs/data-compatibility.md)。

内置的 Univer runtime development license 是获准随本 application 公开再分发的 localhost 运行凭据，按 90 天周期更新，与 repository software license 分离。可以通过 `UNIVER_LICENSE` 或 `univerRuntime.license` 配置覆盖内置凭据。

## 架构

Univer CLI 基于 Univer CLI SDK 构建。标准命令和通用能力由 CLI SDK package 提供并随 application 安装；本仓库负责显式装配，并实现文件、路径、进程、Gateway 和数据升级等本地产品能力。

| 依赖边界          | 职责                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Univer CLI SDK    | command preset、daemon、execution、inspection、render、lint、authoring helper、configuration 和 API reference |
| Univer SDK        | Unit model、Facade、formula、Sheet、Doc、Slide、Base、Board、Office exchange 和 render engine                 |
| Collaboration SDK | Snapshot、changeset、Worktree、service、transport、client 和 persistence contract                             |
| 本仓库            | `.univer` persistence、本地 adapter、Gateway、Viewer、runtime composition、数据升级和诊断                     |

`apps/cli/src/program.ts` 是唯一 composition root，通过 Commander `addCommand()` 显式装配命令。详细 ownership、runtime topology 和 dependency rule 见 [`docs/architecture.md`](docs/architecture.md)。

## Workspace

```text
apps/cli/                           # public univer-cli application
packages/collab-gateway/            # local Collaboration SDK Gateway
packages/collab-gateway-contract/   # Gateway 与 Viewer control-plane contract
packages/collab-web/                # browser Viewer
packages/importrange-formula/       # cross-unit formula plugin
packages/render-preset/             # shared Univer browser composition
packages/render-runtime-client/     # CLI SDK Render Page bundle entry
packages/univerfile-sqlite/         # .univer persistence 与安全升级
docs/                               # architecture、data contract 与维护约束
```

`apps/cli` 是唯一对外 application；`packages/*` 是其私有支撑 package，不作为平行产品发布。

## 开发

```bash
pnpm build       # 构建 CLI、daemon、runtime worker、Viewer 和 render runtime
pnpm test        # 运行 workspace 测试
pnpm check       # format、lint、typecheck、locale freshness、build、test 和 package dry-run
```

本地调试结束后，先停止 daemon，再解除全局链接：

```bash
univer daemon stop
pnpm unlink:cli
```

源码 manifest 保持 `0.0.0` 哨兵版本。新 Univer CLI 固定在 `0.5.x` 版本线，只发布
`alpha`、`insiders` 和 `dev`：`alpha` 是唯一可进入后续对外流程的版本，由匹配
`v0.5.x-alpha.<suffix>` 的 tag push 触发；`insiders` 由默认分支手动触发。三者都只发布到
insider-npm；本仓库不提供 public npm promotion workflow。

```bash
pnpm release:cli -- --channel=insiders --version=0.5.0-insider.example --dry-run
```

`dev` 是本地触发的研发自测发布，允许 dirty worktree，不执行 SDK cohort 检查：

```bash
pnpm release:cli -- --channel=dev --version=0.5.0-dev.example --publish
```

三个 channel 都生成 release manifest、package audit、隔离安装验证报告和 tarball 到 `.release/`，
不进入 repository history。应用代码从 `0.5.x` 起按开源制品发布，不执行混淆；SDK 仍通过闭源 package
边界提供。

## 许可证

仓库源码采用 [Apache-2.0](LICENSE) 许可证。Univer Pro SDK package、运行凭据、原生 binding 和其他第三方组件保留各自的许可条款。
