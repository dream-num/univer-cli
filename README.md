# Univer CLI

这是 `univer-cli` 的 TypeScript、pnpm、Node.js workspace。唯一对用户开放的 application 位于
`apps/cli`，npm package 名是 `univer-cli`，program 和 bin 均为 `univer`。`packages/*` 是 application
内部使用的 storage、Gateway、Viewer、rendering 与 formula package。

`univer-cli` 基于 Univer CLI SDK 开发。标准 command 与通用能力由 CLI SDK package 提供，随 application 安装并在 composition root 中显式装配；本地文件、进程、Gateway、数据升级等 application-specific 能力由本仓库实现。底层 office runtime 与协作能力分别使用 Univer SDK 和 Collaboration SDK。

## 开发

需要 Node.js 22.12 或更高版本，并使用仓库声明的 pnpm 版本。依赖版本和 registry 配置由
`pnpm-lock.yaml` 与 `.npmrc` 统一管理。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check
```

需要在本机以 `univer` 调用当前 workspace 时：

```bash
pnpm dev:link
univer --help
```

停止 daemon 后可解除开发链接：

```bash
univer daemon stop
pnpm dev:unlink
```

CLI 使用方式和命令合同见 [`apps/cli/README.md`](apps/cli/README.md)，当前架构与 SDK 边界见
[`docs/architecture.md`](docs/architecture.md)，`.univer` 数据格式合同见
[`docs/data-compatibility.md`](docs/data-compatibility.md)。

## Workspace

```text
apps/cli/                           # univer-cli application
packages/collab-gateway/            # Collaboration SDK Gateway
packages/collab-gateway-contract/   # Gateway 与 Viewer 的 control-plane contract
packages/collab-web/                # 浏览器 Viewer
packages/importrange-formula/       # cross-unit formula plugin
packages/render-preset/             # Viewer 与 render runtime 的 Univer composition
packages/render-runtime-client/     # browser render runtime
packages/univerfile-sqlite/         # .univer SQLite persistence
docs/                               # 当前架构、数据合同和维护约束
```

## 内部发布验证

发布 staging 和隔离安装验证不会修改 source manifest，也不会直接发布 package：

```bash
pnpm release:pack
pnpm release:verify
```

生成物写入 `.release/`。发布包必须只包含构建输出、README 和构建审计确认的 runtime dependency。
