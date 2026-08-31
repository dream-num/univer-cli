# Univer CLI

> 为 Agent 提供本地命令行工作空间，用于创建、编辑、检查和交付电子表格、文档、演示文稿、多维表格与画布。

[English](README.md) · 简体中文

[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-univer--cli-0a7ea4)](https://github.com/dream-num/skills/tree/main/skills/univer-cli)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.0-339933?logo=node.js&logoColor=white)](apps/cli/package.json)
[![CI](https://github.com/dream-num/univer-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/dream-num/univer-cli/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Univer CLI 是面向 Agent 的本地优先 Office CLI。安装官方 `univer-cli` Skill 后，直接描述想要的结果，Agent 即可创建或编辑 Sheet、Doc、Slide、Base 与 Board，也可以处理已有的 Excel、Word 和 PowerPoint 文件。

Agent 会在隔离的 Worktree 中检查内容、通过 Univer Facade 完成编辑，并验证实际保存的数据模型与渲染结果。任务准备就绪后，Agent 会返回本地 Viewer URL，供你审阅并决定合并、继续修改或放弃。

## 快速开始

将下面的内容完整复制给你使用的 Agent：

```text
安装 Univer CLI Skill：
npx skills add dream-num/skills -s univer-cli -g

将官方示例下载到 ./hello.univer：
https://univer.ai/cli-assets/hello.univer

使用 Univer CLI 打开 ./hello.univer，然后向我提供本地 Viewer 链接，
并介绍我可以探索的内容。

如需帮助，请访问：
https://discord.gg/nThHPupraR
```

## 你可以让它做什么

- **分析和制作表格**：读取或创建数据，清洗字段，编写公式，设置格式与数据验证，添加表格、图表、透视表、筛选器、迷你图、条件格式和图片。
- **撰写和排版文档**：创建段落、富文本、列表、任务、表格、图片、图表、页眉页脚、分页与页面布局。
- **创建和修改演示文稿**：从大纲生成演示文稿，修改指定页面，添加文字、形状、图片、表格、图表与转场，并检查文字越界、溢出和重叠。
- **搭建多维表格**：创建 Base 表、字段、记录和视图，使用公式、筛选、排序、分组与 Sheet 数据引用。
- **绘制可编辑画布**：创建 Board 形状、文本、连接线、图片、原生图表和流程图，并检查连接关系与布局。
- **组合多种内容**：在一个 `.univer` 文件中保存 Sheet、Doc、Slide、Base 与 Board Unit，并支持跨 Unit 引用内容。
- **处理 Office 文件**：导入 Excel、CSV、TSV、Word 和 PowerPoint 文件，再将受支持的内容导出为标准 Office 格式。
- **安全审阅 Agent 修改**：所有写入先进入隔离草稿，只有用户明确决定后才会合并或放弃。

### 试试这些任务

```text
使用 univer-cli 创建工资计算表，包含公式、汇总、数据验证、条件格式和概览图表，
完成后返回 Viewer URL 供我审阅。

使用 univer-cli 将 brief.md 制作成 6 页冒泡排序教学演示文稿，
标记 Worktree 为 ready 前，逐页检查文字溢出和重叠。

使用 univer-cli 创建正式的项目周报，包含执行摘要、风险表、下周计划和页眉页脚，
最后导出为 DOCX。

使用 univer-cli 创建客户跟进 Base，包含公司、联系人、阶段、预计金额和下次行动字段，
并提供按阶段分组的视图。

使用 univer-cli 在同一个 .univer 文件中创建销售 Sheet 和汇总 Slide，
让 Slide 图表读取 Sheet 数据。
```

## 能力一览

| 内容类型 | 创建与编辑                                                 | 校验与审阅                             | 导入                                 | 导出                  |
| -------- | ---------------------------------------------------------- | -------------------------------------- | ------------------------------------ | --------------------- |
| Sheet    | 单元格、公式、样式、表格、图表、透视表、筛选、验证、图片等 | Workbook/Range 结构化检查与截图        | `.xls` `.xlsx` `.xlsm` `.csv` `.tsv` | `.xlsx` `.csv` `.tsv` |
| Doc      | 段落、富文本、列表、任务、表格、图片、图表、页眉页脚、分页 | Document/Paragraph 回读与逐页截图      | `.doc` `.docx`                       | `.docx`               |
| Slide    | 页面、文字、形状、图片、表格、图表、SVG 布局、转场         | 结构检查、layout lint、逐页/联系表截图 | `.ppt` `.pptx`                       | `.pptx`               |
| Base     | 表、字段、记录、视图、公式、筛选、排序、分组               | 结构化数据检查与工作台截图             | `.xls` `.xlsx` `.xlsm` `.csv` `.tsv` | `.xlsx` `.csv` `.tsv` |
| Board    | 形状、文字、连接线、图片、原生图表、自动布线               | 元素/连接关系分析与全局/区域/元素截图  | —                                    | —                     |

所有内容类型都支持隔离草稿、审阅、继续修改、合并和放弃。Board 暂不支持文件导入与导出。

## 工作方式

1. Discovery Skill 检查 Univer CLI 是否已安装、已更新且运行正常。
2. Agent 从已安装 CLI 中加载 core Skill，以及匹配的 Sheet、Doc、Slide、Base 或 Board Skill。
3. Agent 导入或创建 `.univer` 文件，并创建隔离的 draft Worktree。
4. Agent 检查目标 Unit、完成修改，并回读实际保存的数据模型。
5. 对视觉敏感的任务，Agent 会生成截图或执行 layout lint。
6. Agent 将 Worktree 标记为 `ready`，并返回本地 Viewer URL。
7. 用户审阅结果，并明确选择合并、重新打开或放弃。

进入 Worktree 后，Viewer 为 Sheet、Doc、Slide、Base 和 Board Unit 提供只读的 **查看** 与
**对比** 模式。默认对比当前 Worktree 与固定的 Trunk 状态；左侧也可以改选另一个 active Worktree。
对比前，两侧都会物化到各自固定的 head；对比过期后由用户显式刷新。

Sheet 对比提供独立的**内容／格式**筛选和作用于两侧网格的**显示公式**开关。
内容模式使用去掉单元格、富文本、表格主题和条件格式的展示副本，保留差异着色及行列尺寸；格式模式保留原始样式。
公式显示支持解析共享公式，不修改存储值或计算结果；工作表／工作簿范围在变更树的 header 中切换。

语义差异由 Univer Pro History 计算。应用只把返回的变更、内联片段和原生对齐信息映射为本地化导航、
只读着色和视口联动。

同一份固定结果也会通过 Server API 以带版本、且不依赖 UI 的 Agent context 提供。CLI client 与 Agent
可以按 entity type、稳定 parent ID 或搜索文本分页和筛选标准化的新增/删除/修改项；每一项都带有稳定 path 与左右侧导航目标，
覆盖 Sheet、Doc、Slide、Base 和 Board。标准化 leaf change 还会提供语义属性 path、带类型的前后值，以及
有长度上限的文字/公式内联片段。语义 path 必要时保留精确的 `sourcePath`；Doc 对齐数据独立分页，
Sheet 行列对齐采用紧凑的原生索引区间。调用方可选择 `summary`、`changes` 或 `full` 详情级别，且不会改变 item
identity。详见 [Agent diff contract 与可执行案例](packages/collab-gateway-contract/README.md#agent-diff-contract)。

Operational Skills 随 Univer CLI 一同提供，确保其中的 command 和 Facade guidance 与已安装 application 版本一致。

## CLI 能力

Skill 会自动选择这些能力，日常使用通常不需要手动调用。

| 命令                                               | 作用                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `new`、`import`                                    | 创建 `.univer` 文件或导入 Office 内容                                            |
| `status`、`unit`                                   | 查看文件状态并管理 Sheet、Doc、Slide、Base 或 Board Unit                         |
| `worktree`                                         | 创建、准备、重新打开、合并或放弃隔离修改                                         |
| `inspect`                                          | 读取 Workbook、Worksheet、Range、Document、Paragraph、Presentation 或 Slide 数据 |
| `execute`                                          | 通过可信 Univer Facade code 读取或编辑内容                                       |
| `screenshot`、`lint`                               | 渲染内容并诊断 Slide layout 问题                                                 |
| `compile-svg`、`compile-typst`                     | 将 SVG 或 Typst source 转换为可编辑 Univer 内容                                  |
| `export`、`open`                                   | 导出 Office 文件或返回本地 Viewer URL                                            |
| `api`、`resources`、`skills`                       | 查找 Facade API、视觉资源与 operational guidance                                 |
| `config`、`doctor`、`update`、`daemon`、`optimize` | 配置、诊断、更新、运行和维护本地 application                                     |

完整 command option、selector、环境变量、machine output 与进程行为见 [CLI 完整参考](apps/cli/README.zh-CN.md)。

## 要求与当前限制

- 支持 Agent Skills 的 Agent，以及 Node.js 24.0 或更高版本和 npm/npx。
- Screenshot、Slide layout lint 与浏览器文字度量需要 Chrome、Chromium 或 Edge；Agent 可以通过 `univer screenshot setup` 准备浏览器。
- `execute` 执行可信 JavaScript，不能作为不受信任代码的 sandbox。
- `.univer` 文件、Gateway、Viewer、daemon、runtime worker 与 browser cache 保存在本机；显式 HTTP 导入、资源下载与更新检查可能访问网络。
- Board 支持结构与视觉验证，但暂不支持文件导入或导出。

## 架构

Univer CLI 基于 [Univer SDK](https://docs.univer.ai/zh-CN/) 构建。本仓库将 SDK 能力装配为面向 Agent 的本地 Office CLI，并实现 `.univer` 文件、Gateway、Viewer、进程管理和安全数据升级等 application-specific 能力。

`apps/cli` 是唯一公开 application，`univer` 是唯一 program 与 bin。私有 `packages/*` project 仅支撑 application，不是平行产品。

## 数据与安全

`.univer` 是使用 SQLite 保存 Unit、revision、Worktree、本地资源与可重建 History index 的文件。受支持的早期格式只有在只读识别、byte-for-byte backup、独立 candidate 验证和原子替换后才会升级。升级失败不会覆盖源文件。

内置 Univer runtime development license 是获准随本 application 再分发的 localhost application credential，按 90 天周期更新，与 repository software license 分离。

## 开发

本项目需要 Node.js 24.0 或更高版本，以及 `package.json` 声明的 pnpm 版本。

```bash
git clone https://github.com/dream-num/univer-cli.git
cd univer-cli
pnpm install --frozen-lockfile
pnpm link:cli
pnpm check
```

五产品对比性能基准通过实际接入 SDK 的 Gateway 运行，检查中、大案例的准备计算、分页查询、
序列化时间和响应体积预算：

```bash
pnpm --filter @univer/collab-gateway benchmark:five-product --enforce
```

解除本地链接前先停止 daemon：

```bash
univer daemon stop
pnpm unlink:cli
```

### SDK 升级

所有 Univer SDK 依赖（`@univer-cli/*`、`@univerjs/*`、`@univerjs-pro/*`）作为一个精确版本 cohort 统一升级；`@univerjs/icons`、`@univerjs-pro/cli-assets`、`@univerjs-pro/engine-formula-rust-binding` 与 `@univerjs-pro/exchange-node-binding` 保持独立发布链。升级运行：

```bash
pnpm update:sdk --sdk_version <exact-sdk-version>
```

必须同时提交所有受影响的 manifest 与 `pnpm-lock.yaml`，不得手工只更新其中一部分。

## 许可证

[Apache-2.0](LICENSE)。Univer Pro SDK package、runtime credential、native binding 与其他第三方组件保留各自条款。
