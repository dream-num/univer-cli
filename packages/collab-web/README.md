# @univer/collab-web

`@univer/collab-gateway` 提供的浏览器 Viewer。它使用：

- Collaboration SDK browser client 连接 Snapshot/Comb content channel；
- `@univer/collab-gateway-contract` 访问 Unit/Worktree control plane 与 lifecycle event；
- `@univer/render-preset` 组合 Univer SDK content、rendering 和 UI plugin。

Trunk 与 Worktree view 的编辑能力由当前 scope 和 Worktree lifecycle 决定。页面不直接访问 SQLite，不复制
Gateway persistence rule，也不定义独立 collaboration protocol。

```bash
PORT=8000 pnpm --filter @univer/collab-gateway start
UCB_SERVER=http://127.0.0.1:8000 pnpm --filter @univer/collab-web dev

pnpm --filter @univer/collab-web typecheck
pnpm --filter @univer/collab-web test
```
