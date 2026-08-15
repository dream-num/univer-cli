# @univer/univerfile-sqlite

`.univer` 的 SQLite persistence package。它提供：

- current v2 schema 与必要 schema 格式识别；
- Collaboration SDK database adapter；
- Worktree persistence adapter；
- Asset store；
- v0/v1 supported input reader；
- v0/v1 candidate 内的 legacy Base snapshot、block 与 changeset 协同升级；
- backup、candidate、verification 与 atomic replacement 协调。

调用方通过 `openUniverfileSQLite()` 或 `createUniverfileSQLite()` 获得共享同一 connection 的 adapter。打开 v2
是无升级副作用的 operation；打开受支持输入格式时，在替换 source 前保留 byte-for-byte backup 并验证
candidate。

存在 `collaboration_schema_versions` 时，component version 是格式识别的权威来源。格式检查只要求对应版本的
必要表与列；额外 SQLite 对象不会使 current v2 无效。v0/v1 升级只把受支持内容写入 candidate，source-only
表、索引、trigger 与 view 不进入 current v2；它们仍完整保存在 byte-for-byte backup 中。

Base 内容升级只属于 v0/v1 到 v2 的受控迁移。它不改变 current v2 SQLite schema，也不会把已经是 v2 的
文件当作 repair target。

本 package 不负责 CLI command、Gateway transport、Viewer、daemon 或 headless content runtime。

```bash
pnpm --filter @univer/univerfile-sqlite test
pnpm --filter @univer/univerfile-sqlite typecheck
```
