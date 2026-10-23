# 本地 Board 联调

通过 producer tarball 在 source CLI 中测试未发布的 Board 修改。本流程不发布、不合并、不修改 SDK release gate，
也不导入其他 checkout 的源码。需要 Node.js 24、仓库指定版本的 pnpm、`tar`、正常的 SDK registry 配置以及已安装的受支持浏览器。

## 准备 package

通过 producer 现有工具构建和打包修改的 package。在 Univer Pro 中只构建所需插件，再分别打包到新的输出目录：

```bash
pnpm --filter @univerjs-pro/boards --filter @univerjs-pro/boards-ui build
pnpm --filter @univerjs-pro/boards pack --pack-destination <new-output-directory>
pnpm --filter @univerjs-pro/boards-ui pack --pack-destination <new-output-directory>
```

检查归档的 package name、exports 和编译产物。本地 Pro pack 不等于正式 release gate 通过。
每次构建使用新的输出路径，即使 manifest version 未变也如此。

CLI SDK 已有 dev version preparation，可执行完整 artifact 与 clean-consumer gate：

```bash
pnpm release -- --version=1.2.0-dev.<unique-id> --prepare-only
```

在干净的 SDK checkout 中执行，产出 `.release/release-manifest.json` 与 `.release/tarballs/`，不发布。
其精确 dependency pins 必须可解析。Consumer 临时 override 不会让 producer gate 自动通过，
也不会为此前手工打包的 candidate 补上证明。将 producer manifest 与 gate 证据和 package 一起保留；
若 producer 暂时无法准备 dev 产物，明确报告该缺口。

在 tracked configuration 之外建立本地 JSON map。路径相对于 map 或使用绝对路径。记录打包时真实的 producer commit
及源码是否有未提交修改；runner 保留这些显式提供的来源信息，并计算每个归档的 SHA-256。
可选的 `sha256` 可拒绝意外变更的归档：

```json
{
  "@univerjs-pro/boards": {
    "tarball": "./packages/univerjs-pro-boards.tgz",
    "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
    "sourceDirty": true
  }
}
```

包括此次实验所需的全部未发布 dependency，通常为两个 Pro Board package，以及 CLI SDK 的
`headless-univer`、`unit-layout-lint`、`unit-layout-lint-command`、`univer-render-page`、`univer-render-runtime`
和 `api-reference`。Runner 检查归档身份，拒绝仅适用于源码的 `file:`、`link:` 或 `workspace:` dependency。
它不发现相邻 checkout，也不替代 producer release validation。

## 执行与迭代

完成正常 workspace install 后，保持 tracked workspace／lock 配置不变，执行：

```bash
pnpm dev:board --map <sdk-tarballs.json> --output <new-evidence-directory>
```

可选 `--store-dir <path>` 指定已有 pnpm store。命令运行期间，不要在同一 checkout 另行安装、编辑 workspace／lock
或启动第二个联调流程；产品源码仍可正常开发。命令会：

1. 保存 workspace／lock 原始字节，临时安装 map 明确列出的 SDK 归档。
2. 构建 application 的 browser bundle 与 render page；后续仅在归档 hash 与全部 browser package 源码一致时复用，
   不构建 demo application。
3. 通过与 `pnpm dev` 相同的 `tsx` entry 运行 source CLI，使用新的 `.univer` 文件与独立 `UNIVER_HOME`。
   验证 graph plan、stale 拒绝、从浏览器返回 headless `execute` 的非空实测标签修复、再次 lint、
   Worktree ready／merge 和 Trunk 语义读回。
4. 验证真实 model-only lint 的 exit 2、空 stdout 与单个 stderr JSON，仅停止本次 daemon，并在 `finally`
   恢复 workspace／lock 原始字节；普通命令失败时同样恢复。

Evidence 目录保留 command stdout／stderr、package hash／来源、result 与配置原始备份。
并行配置编辑会保留并报错，不会被覆盖。强制杀进程或断电后，先使用这些备份恢复配置再安装；
进程锁位于 `node_modules/.cache/board-dev.lock`。删除数据前，先停止 evidence home 对应的 daemon。
配置恢复后 `node_modules` 仍包含实验依赖；通过正常 `pnpm install --frozen-lockfile` 回到 committed dependency。

交互式 CLI 开发使用 `pnpm dev -- <command>`。现有 Viewer dev server 为 `pnpm --filter @univer/collab-web dev`，
端口 5180；通过 `UCB_SERVER` 指向自己拥有的 application Gateway。
Viewer server 不替代 CLI lint 所需的静态 render-page bundle。SDK／browser 修改使 bundle fingerprint 失效；
仅 CLI 源码修改无需重建浏览器。

本地检查覆盖上述 Board 流程。另行运行 `pnpm check` 与 producer 要求的检查；本地联调成功不等于正式 release，
也不表示全部 Windows database 检查已通过。
