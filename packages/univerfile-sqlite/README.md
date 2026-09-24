# @univer/univerfile-sqlite

`.univer` 的 SQLite persistence package。它提供：

- current v3 schema 与必要 schema 格式识别；
- Collaboration SDK database adapter；
- Worktree persistence adapter；
- History boundary adapter；
- Asset store；
- v0/v1/v2 supported input reader；
- v0/v1 candidate 内的 legacy Base snapshot、block 与 changeset 协同升级；
- backup、candidate、verification 与 atomic replacement 协调。

调用方通过 `openUniverfileSQLite()` 或 `createUniverfileSQLite()` 获得共享同一 connection 的 adapter。打开 v3
是无升级副作用的 operation；打开受支持输入格式时，在替换 source 前保留 byte-for-byte backup 并验证
candidate。再次打开同一份未变化的文件时复用已有的相同字节 backup。Windows 上迁移在 helper 进程中完成，
持锁的父进程在 helper 退出后替换 source。

存在 `collaboration_schema_versions` 时，component version 是格式识别的权威来源。格式检查只要求对应版本的
必要表与列；额外 SQLite 对象不会使 current v3 无效。升级只把受支持内容写入 candidate，source-only
表、索引、trigger 与 view 不进入 current v3；它们仍完整保存在 byte-for-byte backup 中。

Base 内容升级只属于 v0/v1 的受控迁移。它不改变 SQLite schema，也不会把 v2 或 v3 文件当作 repair target。

Core 与 Worktree adapter 在提交 changeset 时把 `created_at_ms` 写为 Unix 毫秒，payload 的 `createTime` 写为它的
整秒，并从 Unit record 持久化
`creatorID` 与 `createdAt`。各版本差异和 v2 到 v3 的迁移规则见
[`.univer` 数据兼容](../../docs/data-compatibility.md)。

本 package 不负责 CLI command、Gateway transport、Viewer、daemon 或 headless content runtime。

Worktree Unit 删除仍使用应用现有的 `deleteUnit` 流程。SDK 的可撤销移除接口 `setUnitRemoved`
在此 adapter 中返回 `INVALID_REQUEST`，不会写入移除状态或改变文件格式。

```bash
pnpm --filter @univer/univerfile-sqlite test
pnpm --filter @univer/univerfile-sqlite typecheck
```
