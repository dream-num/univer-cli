# Univer CLI Skills

这些 Skill 是 `univer-cli` application-owned、version-matched 的运行时文档资产。build 将本目录完整复制到
`dist/skills`，application file library 只读加载构建产物。

公开 runtime Skill：

- `core`
- `sheet`
- `doc`
- `slide`
- `base`
- `board`
- `embed`
- `cross-unit-formula`

`discovery/univer-cli` 是可按名称读取的 discovery Skill，不进入默认 list 或 `get --all`。Skill 内容必须与当前 command、CLI SDK standard capability 和 Univer SDK Facade 保持一致；command contract 改动时同步更新对应 Skill 和测试。

runtime 不读取相邻 checkout。`src/skills` 是 source of truth，`dist/skills` 仅为 build output。
