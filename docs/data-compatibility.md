# `.univer` 数据兼容

`.univer` 是 Univer CLI 的用户数据边界。当前新建文件使用 v3；v0、v1 与 v2 是受支持的输入格式，在
application 显式打开对应路径时安全升级到 v3。

## 稳定合同

- 首次接触文件时只读识别格式；component version table 是 versioned 文件的权威来源，只验证声明版本的必要
  schema。unknown component/version、必要 schema 缺失或 corrupt schema 明确失败。
- 只处理调用方显式提供的 `.univer` 路径，不扫描或批量修改 Application home。
- 升级顺序固定为
  `detect -> lock -> backup -> read -> canonical model -> write candidate -> verify -> atomic replace`。
- backup 与升级前文件 byte-for-byte 一致，向调用方报告路径与 hash，且不自动删除。
- candidate 使用当前 SQLite schema 写入，并通过 storage 与 runtime 的公开读取能力验证。
- 输入 source 中不属于受支持 schema 的额外表、索引、trigger 与 view 不写入 candidate；byte-for-byte backup
  保留完整 source。current v3 只要求必要 schema，额外 SQLite 对象不会触发升级或清理副作用。
- replace 前的任何失败都不得改变源路径；失败的 candidate 会被清理，backup 保留。
- v0/v1 candidate 会把 Base 内容 schema v1 同步升级为当前 schema v2，包括 checkpoint、sheet block、
  Worktree seed/merge artifact，以及依赖旧字段位置的 Base changeset。v2 source 的 Base 内容已经是当前
  schema，不作为 repair target。
- v3 文件直接打开且不产生升级副作用。
- 每个受支持输入格式都有固定 fixture、package test 和 built-bin end-to-end test。

## 格式版本

| `.univer` | core                       | worktree | assets   | history  | 写入方                           |
| --------- | -------------------------- | -------- | -------- | -------- | -------------------------------- |
| v0        | 无 component version table |          |          |          | 早期 CLI                         |
| v1        | 1                          | 1        | 1 或缺失 | 1 或缺失 | Collaboration SDK 之前的 Gateway |
| v2        | 1                          | 2        | 1        | 1 或缺失 | Collaboration SDK `1.0.0-rc.0`   |
| v3        | 2                          | 3        | 1        | 2 或缺失 | Collaboration SDK `1.0.0`        |

v3 与 v2 的差异来自 Collaboration SDK `1.0.0` 的 persistence contract：

- `collaboration_units` 与 `collaboration_worktree_units` 增加 `creator_id`；`created_at_ms` 表示 Unit 本身的
  创建时间。trunk 来源的 Worktree Unit 继承 trunk Unit 的创建者与创建时间。
- trunk 与 Worktree changeset payload 的 `createTime` 是 adapter 在提交时写入的 Unix 秒。
- History 只保存 segment 起点 `collaboration_history_records`，不再逐 revision 保存
  `collaboration_history_revisions`。revision 1 只属于创建记录。

## v2 到 v3

- Unit 创建者依次取 rc History revision 1 的 `user_id`、trunk revision 2 changeset 的 `userID`，否则为
  `local`。Worktree 中新建 Unit 的创建者取 Worktree `agent_id`，否则为 `local`。
- `createTime` 大于等于 `1e11` 时按毫秒换算为秒；缺失时依次取同一 revision 的 rc History 时间、同一 Unit 上一
  revision 的时间、Unit 或 Worktree 的创建时间。v0 source 同样执行该规范化。
- rc History 中 `history_revision = revision` 的行转换为 segment 起点，另为 revision 2 补一个起点，并丢弃超过
  core head 的起点。某个 Unit 的 rc History 不连续或引用不存在的起点时，只清空该 Unit 的 History。
- 升级结果的 `omitted` 为空；v0/v1 升级仍报告 `logical-commit-history`。

## 当前格式

`@univer/univerfile-sqlite` 拥有 v3 schema、格式识别、v0/v1/v2 reader、升级协调和验证逻辑。调用方通过统一的
`openUniverfileSQLite()` seam 获得共享 connection 的 Collaboration SDK database adapters、History adapter
与 Asset store。`history@2` 是可选输入组件，也是可重建的派生索引：History Service 在 Unit 没有记录时从权威
trunk Unit/changeset 初始化，在下一次提交时补齐落后的 Unit；Gateway 启动时按 Unit 删除超过 core head 的
记录。这些操作都不改变 core revision。

升级结果包含 source/target format、backup path/hash、Unit/Worktree/Asset verification count、无法带入当前
模型的 logical history，以及 Worktree 状态规范化数量。Gateway、daemon 和 command handler 不直接操作
SQLite schema。
