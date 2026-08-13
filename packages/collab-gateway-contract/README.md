# @univer/collab-gateway-contract

Gateway、Viewer 与 CLI 共用的 source-first control-plane contract。它定义：

- `.univer` 绝对路径与 `fileKey` 的 base64url 转换；
- Gateway descriptor 与 collaboration-client runtime URL；
- Unit/Worktree catalog、lifecycle request/response 和 error envelope；
- typed `WorktreeControlClient`；
- lifecycle WebSocket event。

Snapshot、changeset 与 content protocol 直接使用 `@univerjs/protocol` 和 Collaboration SDK；本 package 只拥有
application control plane。

```ts
const control = new WorktreeControlClient({
  origin: "http://127.0.0.1:8000",
  univerfile: "/abs/book.univer",
});
const { worktreeId } = await control.createWorktree({ agentId: "a1" });
await control.ready(worktreeId);
```

```bash
pnpm --filter @univer/collab-gateway-contract test
pnpm --filter @univer/collab-gateway-contract typecheck
```
