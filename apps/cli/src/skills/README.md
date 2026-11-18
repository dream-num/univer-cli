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

Agent 从仓库根目录的 `skills/univer-cli/` 安装 discovery Skill。
`univer skills` 只读取 runtime Skills。

runtime Skills 随 `univer-cli` npm 包发布。command、CLI SDK capability 或 Univer SDK Facade 的合同变化时，
同步更新对应的 Skill 和测试。
