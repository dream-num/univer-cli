# @univer/collab-gateway

面向多个 `.univer` 文件的本地 Collaboration SDK Gateway。每个已打开文件由 `GatewayFileRuntime` 组合：

- `@univer/univerfile-sqlite` database adapter 与 Asset store；
- Collaboration SDK Service、Endpoint 和 Node Transport；
- Unit/Worktree control plane；
- lifecycle WebSocket；
- Viewer static assets。

Gateway 使用显式文件路径寻址。`/uf/<fileKey>` 中的 `fileKey` 是规范化绝对路径的 base64url 编码，每个 request
均携带目标 Univerfile，不存在隐式 active file。

内容读取和提交使用 Collaboration SDK 的 Snapshot/Comb/changeset contract；Worktree 状态变化使用 SDK
lifecycle。打开 v0/v1 Univerfile 时，统一 open seam 委托 `@univer/univerfile-sqlite` 执行安全升级。Gateway
不直接操作 SQLite schema，也不实现 browser content engine。

```bash
pnpm --filter @univer/collab-gateway typecheck
pnpm --filter @univer/collab-gateway test
```
