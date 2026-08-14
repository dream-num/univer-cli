# Univer CLI

Univer CLI 为 Agent 和本地工作流提供 office content 的创建、编辑、检查、渲染与协作能力。

## Language

**Univer CLI**:
npm package `univer-cli` 提供的 application；其 program 和 bin 名均为 `univer`。
_Avoid_: application checkout、CLI workspace

**CLI contract**:
用户、脚本或 Agent 可观察的 command、option、默认值、输出、exit code、环境变量和服务协议。
_Avoid_: handler contract、内部接口

**Univerfile**:
以 `.univer` 为扩展名的本地 office content container。
_Avoid_: project file、workspace database

**Current data format**:
Univerfile 新建时使用且 application 可直接读写的格式。
_Avoid_: latest schema、new format

**Supported input format**:
application 能够安全升级到 Current data format 的既有 Univerfile 格式。
_Avoid_: obsolete format、unrecognized format

**Unit**:
Univerfile 中可独立寻址的 Sheet、Doc、Slide、Base 或 Board 内容单元。
_Avoid_: document、file

**Trunk**:
Univerfile 中已合并内容的主视图。
_Avoid_: main branch、default Worktree

**Worktree**:
相对于 Trunk 隔离的一组可审阅内容变更，具有明确的 lifecycle 状态。
_Avoid_: Git worktree、session、draft file

**Gateway**:
为 Univerfile 提供 Collaboration SDK 数据通道和 Worktree control plane 的本地服务。
_Avoid_: daemon、Viewer backend

**Viewer**:
连接 Gateway 以查看或编辑 Unit 的浏览器 application。
_Avoid_: render runtime、screenshot page

**Runtime worker**:
由 daemon 管理、为 CLI operation 提供 headless Univer execution 的进程。
_Avoid_: daemon、browser runtime

**Application home**:
由 `${UNIVER_HOME:-~/.univer}` 解析出的 CLI 用户状态根目录。
_Avoid_: Univerfile、工作目录

**Machine result**:
Command 在 `--json` 模式成功时写入 stdout 的单个 command-specific JSON document。
_Avoid_: JSON log stream、success envelope

**Machine failure**:
Command 在已识别 `--json` 模式失败时写入 stderr 的单个 JSON document，并以非零状态退出。
_Avoid_: stdout error、message parsing

**SDK dependency boundary**:
application 只通过 Univer SDK、Collaboration SDK 与 Univer CLI SDK 的正式 package 和 API 获得 Univer 能力。
_Avoid_: adjacent checkout、copied SDK source

**Standard CLI capability**:
由 Univer CLI SDK package 提供、随 application 安装并由 composition root 显式装配的通用 command 或能力。
_Avoid_: built-in application logic、automatic command discovery

**Application-specific capability**:
由本仓库为本地产品需求实现的文件、路径、进程、Gateway、数据升级或其他业务能力。
_Avoid_: CLI SDK standard capability、copied SDK implementation

**Runtime development license**:
供本地 Univer runtime 使用、按 90 天周期更新的 application credential。
_Avoid_: repository software license、package license
