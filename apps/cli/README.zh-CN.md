# Univer CLI

[English](README.md)

`univer-cli` 为 Agent 和本地工作流提供 office content 的创建、编辑、检查、交换、渲染与协作能力。npm
package 名为 `univer-cli`，program 和 bin 均为 `univer`。

application 基于 Univer CLI SDK 开发。标准 command 与通用能力由 CLI SDK package 提供，随 application 安装并在 `program.ts` 中显式装配；本地文件、进程、Gateway、数据升级等 application-specific 能力由本仓库实现。

## Commands

```text
univer new <file.univer>
univer open <file.univer>
univer status <file.univer>
univer import <target.univer> --file <local-path|https-url> [--formula-calculation <mode>]
univer export <file.univer> <output.xlsx|csv|tsv|docx|pptx> [--sheet <name>|--table <name>]
univer worktree add|list|ready|reopen|merge|discard ...
univer unit add|remove|list ...
univer execute <file.univer> --worktree <id> --unit <id> -e '<facade-js>'
univer inspect <target> <selectors...> <file.univer> --unit <id> (--trunk|--worktree <id>)
univer lint --file <file.univer> --unit <slide-id> [--worktree <id>] [--pages <pages>]
univer screenshot <file.univer> [--worktree <id>] [--unit <id>] [--out <dir>]
univer screenshot setup [--force]
univer compile-svg <file.svg> ...
univer compile-typst <bundle> ...
univer resources registries|find|export|cache ...
univer api find|show ...
univer optimize <file.univer> (--dry-run|--out <copy.univer>)
univer config path|list|get|set|unset ...
univer doctor [--json]
univer doctor collect [--last <duration>|--since <time>|--all] [--trace-id <id>] [--output <dir>]
univer skills [list] [--json]
univer skills get (<name>|--all) [--full] [--json]
univer skills path [name] [--json]
univer update [--force] [--json]
univer daemon status|start|restart|stop
```

## Local development

需要 Node.js 22.12 或更高版本。workspace 通过 `.npmrc` 解析 Univer CLI SDK、Univer SDK 与 Collaboration
SDK，并通过 lockfile 固定完整依赖图。

```bash
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/bin.js --help
node apps/cli/dist/bin.js new ./book.univer
node apps/cli/dist/bin.js status ./book.univer
node apps/cli/dist/bin.js open ./book.univer
node apps/cli/dist/bin.js doctor --json
node apps/cli/dist/bin.js daemon stop
```

将当前 build 链接为 active Node 环境中的 `univer`：

```bash
pnpm link:cli
command -v univer
univer --help
```

解除链接前先停止 daemon：

```bash
univer daemon stop
pnpm unlink:cli
```

`pnpm build` 生成 CLI、application daemon 与 CLI SDK runtime pool 使用的 headless worker，并构建 browser
render runtime 到 `apps/cli/dist/render-runtime`。Gateway、Viewer 与 runtime worker 由 daemon 按需启动；
screenshot 和 text measurement 的 browser 只在对应 operation 中启动。

## Core authoring loop

`new` 创建空 Univerfile。内容写入发生在 `draft` Worktree：

```bash
univer new ./book.univer
univer worktree add ./book.univer --name agent --json
univer unit add ./book.univer --worktree <worktree-id> --type sheet --name Plan --json
univer execute ./book.univer --worktree <worktree-id> --unit <unit-id> \
  -e 'workbook.getActiveSheet().getRange("A1").setValue("done");'
univer inspect range A1 ./book.univer --worksheet name:Plan \
  --unit <unit-id> --worktree <worktree-id> --json
univer worktree ready ./book.univer --worktree <worktree-id>
univer worktree merge ./book.univer --worktree <worktree-id>
```

Unit mutation 和 `execute` 只允许在 `draft` Worktree；`ready` 后必须 `reopen` 才能继续写。`execute` 使用 CLI
SDK content-execution prelude，执行前 pull，捕获 mutation 后自动提交，并报告 Collaboration revision。只读代码
不创建 revision。

`inspect` 使用 CLI SDK selector grammar：`name:`、`id:`、`index:`，其中 index 为 1-based。读取 Sheet range
时使用 `--worksheet`。每次 inspection 必须通过 `--trunk` 或 `--worktree <id>` 明确选择一个 scope。

## Import and export

`import` 使用 Univer SDK Exchange Node 导入本地或 HTTP(S) XLS/XLSX/XLSM/CSV/TSV、DOC/DOCX 与 PPT/PPTX。
HTTP(S) source 由 Local adapter 流式写入保留原后缀的临时文件，完成或失败后清理；error message 会移除 URL
credential、query 和 fragment。

未指定 `--worktree` 时，import 只创建新的 Univerfile；指定 Worktree 时写入 draft。`export` 支持
Sheet/Base → XLSX/CSV/TSV、Doc → DOCX、Slide → PPTX。CSV/TSV 使用 `--sheet` 或 `--table` 选择一个输出
对象。`--formula-calculation forced|when_empty|no` 控制 Sheet converter 的公式计算策略；未指定时保持
`forced` 兼容默认值。

`univer open` 的可编辑 Viewer 支持通过 Ribbon 导入和导出：导入会在当前 `.univer` 中新建 Unit。Sheet 可查看按提交时间聚合的版本历史；只读 Viewer 只能查看，可编辑 Viewer 可以显式恢复历史版本。只读 Sheet 中不提供保护和打印。Worktree 与合并预览不提供导入、导出或版本历史；其他受支持的 Unit 仍可打印，Board 仅支持打印。

`optimize` 是 copy-only operation；除 `--dry-run` 外必须提供 `--out`，不会覆盖 source。

## Rendering and authoring helpers

`screenshot` 使用 CLI SDK screenshot/render capability，并由 application 提供 Univerfile、Worktree、browser
cache 与 local asset adapter。Sheet、Base、Doc、Slide 和 Board 均可渲染，默认输出目录为 `./screenshots`。

```bash
univer screenshot setup
univer screenshot ./book.univer --unit <sheet-id> --range A1:H40 --out ./shots
univer screenshot ./book.univer --worktree <id> --unit <slide-id> \
  --pages 1,3-5 --contact-slide --tile 3x2 --out ./shots
univer lint --file ./book.univer --worktree <id> --unit <slide-id> --pages 1,3-5
```

`lint` 使用 CLI SDK layout-lint capability，对 browser glyph geometry 执行 `text-off-page`、
`text-escapes-container` 与 `text-overlaps-text` 检查。finding 是带几何证据的复查建议。

`compile-svg` 默认使用 browser runtime 的真实字体测量；`--estimate-text-size` 才使用确定性估算。
`compile-typst --apply` 在内存中物化 Doc snapshot，再作为一个 Worktree Unit 写入。`resources` 使用配置的
resource manifest，并将下载缓存写入 `${UNIVER_HOME}/cache/resources`。

## Configuration and processes

`config path/list/get/set/unset` 使用 CLI SDK config preset。application 注册：

- `collabGateway.port`
- `screenshot.maxPages`
- `screenshot.maxPixels`
- `update.checkOnStartup`
- `univerRuntime.license`

读取 command 不创建配置文件；`set/unset` 保留未知字段。

- Application home 是 `${UNIVER_HOME:-~/.univer}`，配置文件为 `${UNIVER_HOME}/config.json`。
- `UNIVER_COLLAB_GATEWAY_PORT` 覆盖 Gateway port，默认值为 `9123`。
- `UNIVER_LICENSE` 覆盖 `univerRuntime.license`；两者都未设置时使用 application 内置的 90 天 Runtime
  development license。
- 内置的 localhost Runtime development license 已获准随本 application 公开再分发，按 90 天周期更新；它不是 repository software license。
- browser cache 位于 `${UNIVER_HOME}/browsers`；`UNIVER_RENDER_BROWSER` 可指定 Chrome/Chromium，
  `UNIVER_RENDER_BROWSER_CACHE` 可覆盖 cache path。
- `daemon status` 是只读检查；application 只管理身份验证属于自身的 daemon process。
- daemon startup error 保留原始 code 和 detail；Gateway 状态、origin 与 Viewer URL 会出现在 daemon status 中。

`update` 根据当前 version 选择 stable 或 insiders channel。普通交互 command 至多每 24 小时刷新一次缓存；
`--json`、非交互 command、help 和 version 不显示 update tip。development link 不执行自更新。

`doctor` 聚合 config、daemon 与 browser check。`doctor collect` 创建权限为 `0700` 的目录与 `0600` 的 JSON，
并对 credential、token、license、URL userinfo/query/fragment 和 Bearer value 脱敏。

`skills` 从 build 随包发布的 `dist/skills` 读取 version-matched application assets，不读取相邻 checkout。

## Data compatibility

新 Univerfile 使用 v2。v0 与 v1 是受支持的输入格式，在 application 首次显式打开路径时升级到 v2。升级执行
只读识别、lock、byte-for-byte backup、独立 candidate、storage/runtime 验证、source hash 复查和 atomic
replace；失败不会替换 source。v2 再次打开是无副作用 operation。

完整合同见 [data compatibility contract](https://github.com/dream-num/univer-cli/blob/main/docs/data-compatibility.md)。

## Machine output

带 `--json` 的成功 command 向 stdout 输出一个 command-specific JSON document，不增加全局 success envelope。
argv 已识别 `--json` 后发生失败时，stderr 输出一个 JSON document 并以非零状态退出：

```json
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

文本模式、help、version 与 parser failure 使用 Commander 和 CLI SDK 的标准输出。

## Architecture and SDK relationship

- `apps/cli/src/program.ts` 使用 Commander `addCommand()` 组合 CLI SDK command preset 与 Local command。
- Univer SDK 提供 Unit model、Facade、formula、render engine 和 browser plugin。
- Collaboration SDK 提供 Snapshot、changeset、Worktree service、endpoint、transport、client 与 persistence
  contract。
- Univer CLI SDK 提供标准 command、通用 capability、Commander preset、daemon、runtime pool、inspection、execution、exchange、render、lint、authoring helper、config 与 API reference；这些 package 随 application 安装，并由 composition root 显式装配。
- application-specific 能力由本仓库实现，包括 path、Home、daemon/Gateway composition、数据升级、browser packaging、Local I/O 和诊断。

详细 ownership 和 dependency rule 见 [architecture document](https://github.com/dream-num/univer-cli/blob/main/docs/architecture.md)。

## Verification

```bash
pnpm check
```

质量门覆盖 format、lint、typecheck、locale freshness、build、workspace tests、built executable、
Gateway/Viewer/runtime worker、browser render smoke 与 package dry-run。

## 许可证

仓库源码采用 [Apache-2.0](LICENSE) 许可证。Univer Pro SDK package、运行凭据、原生 binding 和其他第三方组件保留各自的许可条款。
