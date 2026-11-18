# Univer CLI Skills

本目录下的 `runtime/` 保存与 CLI 版本匹配的操作指南。构建时将其复制到 `dist/skills/runtime/`。

公开 runtime Skill：

- `core`
- `sheet`
- `doc`
- `slide`
- `base`
- `board`
- `embed`
- `cross-unit-formula`

仓库根目录的 `skills/univer-cli/` 是对外安装的 discovery Skill 的唯一源目录。构建时将其复制到
`dist/skills/discovery/univer-cli/`，供 `univer skills get univer-cli` 按名称读取。
`univer skills list` 和 `univer skills get --all` 只列出 runtime Skills。

runtime Skills 随 `univer-cli` npm 包发布。command、CLI SDK capability 或 Univer SDK Facade 的合同变化时，
同步更新对应的 Skill 和测试。
