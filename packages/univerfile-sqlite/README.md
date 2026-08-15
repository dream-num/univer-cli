# @univer/univerfile-sqlite

`.univer` 的 SQLite persistence package。它提供：

- current v2 schema 与严格格式识别；
- Collaboration SDK database adapter；
- Worktree persistence adapter；
- Asset store；
- v0/v1 supported input reader；
- v0/v1 candidate 内的 legacy Base snapshot、block 与 changeset 协同升级；
- backup、candidate、verification 与 atomic replacement 协调。

调用方通过 `openUniverfileSQLite()` 或 `createUniverfileSQLite()` 获得共享同一 connection 的 adapter。打开 v2
是无升级副作用的 operation；打开受支持输入格式时，在替换 source 前保留 byte-for-byte backup 并验证
candidate。

Base 内容升级只属于 v0/v1 到 v2 的受控迁移。它不改变 current v2 SQLite schema，也不会把已经是 v2 的
文件当作 repair target。

本 package 不负责 CLI command、Gateway transport、Viewer、daemon 或 headless content runtime。

```bash
pnpm --filter @univer/univerfile-sqlite test
pnpm --filter @univer/univerfile-sqlite typecheck
```
