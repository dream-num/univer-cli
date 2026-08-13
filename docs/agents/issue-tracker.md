# Issue tracker: Local Markdown

Issues 和 specs 以 Markdown 文件保存在本机 `.scratch/` 下。该目录是临时工作区，不属于 repository 文档，
不得复制到新 repository 或纳入版本历史。

## Conventions

- 每个 feature 使用一个目录：`.scratch/<feature-slug>/`。
- Spec 文件是 `.scratch/<feature-slug>/spec.md`。
- Implementation issue 位于 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号。
- Triage 状态写在 issue 文件顶部附近的 `Status:` 行，取值见 `triage-labels.md`。
- Comments 与历史追加到文件末尾的 `## Comments`。

当 skill 要求“publish to the issue tracker”时，创建对应的 `.scratch/<feature-slug>/` 文件。
