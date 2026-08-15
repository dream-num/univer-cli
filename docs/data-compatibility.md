# `.univer` 数据兼容

`.univer` 是 Univer CLI 的用户数据边界。当前新建文件使用 v2；v0 与 v1 是受支持的输入格式，在 application
显式打开对应路径时安全升级到 v2。

## 稳定合同

- 首次接触文件时只读识别格式；unknown、mixed、partial 或 corrupt schema 明确失败。
- 只处理调用方显式提供的 `.univer` 路径，不扫描或批量修改 Application home。
- 升级顺序固定为
  `detect -> lock -> backup -> read -> canonical model -> write candidate -> verify -> atomic replace`。
- backup 与升级前文件 byte-for-byte 一致，向调用方报告路径与 hash，且不自动删除。
- candidate 使用当前 SQLite schema 写入，并通过 storage 与 runtime 的公开读取能力验证。
- replace 前的任何失败都不得改变源路径；失败的 candidate 会被清理，backup 保留。
- v0/v1 candidate 会把 Base 内容 schema v1 同步升级为当前 schema v2，包括 checkpoint、sheet block、
  Worktree seed/merge artifact，以及依赖旧字段位置的 Base changeset；SQLite v2 schema 不因此改变。
- v2 文件直接打开且不产生升级副作用。
- 每个受支持输入格式都有固定 fixture、package test 和 built-bin end-to-end test。

## 当前格式

`@univer/univerfile-sqlite` 拥有 v2 schema、格式识别、v0/v1 reader、升级协调和验证逻辑。调用方通过统一的
`openUniverfileSQLite()` seam 获得共享 connection 的 Collaboration SDK database adapters 与 Asset store。

升级结果包含 source/target format、backup path/hash、Unit/Worktree/Asset verification count、无法带入当前
模型的 logical history，以及 Worktree 状态规范化数量。Gateway、daemon 和 command handler 不直接操作
SQLite schema。
