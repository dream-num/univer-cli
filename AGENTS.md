# Repository Guidelines

这是一个 TypeScript、pnpm、Node.js workspace。唯一公开 application 位于 `apps/cli`，基于 Univer CLI SDK 开发；`packages/*` 是其私有支撑 package。

## Product contract

- 唯一公开 program name 和 bin 是 `univer`。
- product scope 是单一 Lite target，不增加 target selector 或平行 application identity。
- 用户数据必须兼容或通过受控升级进入当前格式。升级必须先只读识别、保留完整 backup、验证 candidate，
  再原子替换。
- README 与 docs 只描述当前 architecture、contract 和维护约束；不记录仓库搬迁、实现阶段、baseline、
  commit 来源或已完成项目日志。
- `README.md` 与 `README.zh-CN.md` 必须同步维护，章节结构与产品语义保持一致。

## Architecture

- `apps/cli/src/program.ts` 是 composition root，通过原生 Commander `addCommand()` 显式装配。
- 标准 command、通用 capability、Commander preset 与 runtime orchestration 由 Univer CLI SDK package 提供，随 application 安装，并在 composition root 中显式装配。
- `.univer`、路径、进程、Gateway、数据升级和其他 application-specific 能力由本仓库实现。
- command handler 保持轻薄，业务规则进入 capability 或 application use case。
- Univer runtime 和数据模型只通过 Univer SDK 使用；协作数据通道与 Worktree 语义只通过 Collaboration SDK 使用。
- 不依赖相邻 checkout，不复制 SDK 源码，不从其他 Univer repository 导入实现 snapshot；例外见下方
  “Shared packages”。
- 新增 Univer dependency 前必须确认它属于上述三个 SDK 边界，并在 architecture 文档中保持关系准确。

## Development

- strict ESM、named exports、两空格缩进，导出函数显式返回类型。
- Git commit message 必须使用英文。
- 使用 Vitest、oxlint、oxfmt；CLI 测试放在 `apps/cli/test/*.test.ts`，package 测试放在各自的 `test/`。
- 修改 command、manifest 或数据合同必须更新测试与 README/docs。
- SDK 升级运行 `pnpm update:univer-sdk --sdk_version <exact-semver>`；必须同时提交所有受影响的 manifest 与
  `pnpm-lock.yaml`，不得手工只更新其中一部分。
- Runtime development license 是 90 天轮换的运行凭据；不得将其描述为 repository software license。
- 完成前运行 `pnpm check`。

## Agent skills

### Issue tracker

Issues 和 specs 使用不进入 repository history 的 `.scratch/` 本地 Markdown tracker。详见
`docs/agents/issue-tracker.md`。

### Triage labels

使用默认五态 vocabulary。详见 `docs/agents/triage-labels.md`。

### Domain docs

使用 single-context glossary：根目录 `CONTEXT.md`。详见 `docs/agents/domain.md`。

## Shared packages

以下 package 在多个 Univer repository 各有一份，这是对“不从其他 Univer repository 导入实现 snapshot”的例外；
修改时必须同步更新所有副本。

- `packages/univerfile-sqlite`：univer-cli 与 `dream-num/dsh-univer-office` 各有一份，两份的 `src/` 与 `test/`
  必须保持逐字节一致。
- `packages/unit-comparison-viewer`：univer-cli、`dream-num/univer-workspace` 与 `dream-num/dsh-univer-office`
  各有一份，保持行为一致，允许各自针对宿主做兼容。目前没有适合放置 application-level shared UI component 的
  公共位置。
