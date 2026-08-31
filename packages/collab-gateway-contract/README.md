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

Pinned comparisons expose the same normalized Server API context to CLI, Agent, and Viewer consumers:

```ts
const comparison = await control.createUnitComparison(worktreeId);
const page = await control.getUnitComparisonContext(worktreeId, comparison.comparisonId, unitId, {
  entityTypes: ["cell"], // Formula changes are leaf changes of a cell, not a separate entity.
  parentStableId: sheetId,
  limit: 100,
  detail: "changes",
});

for (const item of page.context.items) {
  console.log(item.kind, item.path, item.locations.left, item.locations.right);
  for (const change of item.changes) {
    console.log(change.path, change.valueType, change.before, change.after);
  }
}
```

### Agent diff contract

`GET /uf/:fileKey/worktrees/:right/comparisons/:comparison/units/:unit/diff` 返回两层稳定结构：

- `item` 是可定位的 changed entity，包含 `stableId`、`parentStableId`、Unit-root `path`、
  `kind`、左右 `locations` 与 `moved`；
- `item.changes` 是 entity 内的 leaf change，包含相对 `path`、`valueType`、`before`、`after`，
  文本和公式还可以包含左右 `segments`。语义 `path` 与产品原始路径不同时，`sourcePath` 保留精确位置，
  例如嵌套表格的行/单元格索引；
- `summary`、`coverage` 和 `diagnostics` 让 Agent 区分“没有变化”“当前版本不覆盖”和“已降级”；
- `productContext` 补充 SDK 计算的导航与对齐数据：Doc paragraph alignment 包含两侧原生段落 ID，
  Sheet 提供紧凑的行列索引区间。应用不根据 snapshot 或 mutation 重算这些关系。

`detail` 控制 payload，而不改变 item identity 或分页顺序：

| detail    | 返回内容                                                                 | 推荐用途                      |
| --------- | ------------------------------------------------------------------------ | ----------------------------- |
| `summary` | entity identity、kind、location；不返回 leaf change 或 raw entity        | 发现、筛选和规划              |
| `changes` | 再返回 leaf before/after 与文本/公式 segment；不返回重复的 `item.values` | Agent 理解、解释与 Compare UI |
| `full`    | 再返回 `item.values.left/right` 原始产品 projection                      | 深度诊断与兼容旧 consumer     |

`includeValues=false|true` 仍作为 `summary|full` 的兼容别名；新 consumer 应显式使用 `detail`。
`offset/limit` 只控制变更项；`contextOffset/contextLimit` 独立控制 Doc 对齐行（每页最多 1000）。
即使变更项已读完，渲染完整 Doc 仍需读取 `paragraphAlignment.page.hasMore` 指向的后续对齐页。
颜色只是上述对称语义的 UI 表达：insert 为绿色、delete 为红色、update/move 为蓝色。交换左右侧时，
insert/delete 互换、before/after 与 location 互换，update 保持 update。

Comparison 会固定两侧 head。每页的 `stale` 为 true 时，调用方应新建 comparison，而不是把不同时间点的
分页结果拼接。`diagnostics.unsupportedMutationIds` 只报告疑似改变 Sheet 坐标、但尚不能用于双侧映射的
mutation；普通值和样式 mutation 由最终 snapshot diff 覆盖。

### 可直接执行的案例

先启动本仓库 Gateway，然后运行无需编译、仅依赖 Node 内置 `fetch` 的示例：

```bash
node packages/collab-gateway-contract/examples/agent-diff-context.mjs \
  --file /absolute/path/showcase.univer \
  --right-worktree wt-current \
  --unit unit-id \
  --detail changes
```

默认左侧是 Trunk；加入 `--left-worktree wt-base` 可比较两个未合入 Worktree。示例会先固定 comparison，
再读取所有分页并输出一个完整 JSON context。可用 `--entity-type`、`--kind`、`--parent` 和 `--search`
收窄结果；运行 `node packages/collab-gateway-contract/examples/agent-diff-context.mjs --help` 查看全部参数。

```bash
pnpm --filter @univer/collab-gateway-contract test
pnpm --filter @univer/collab-gateway-contract typecheck
pnpm --filter @univer/collab-gateway-contract example:agent-diff -- --help
```
