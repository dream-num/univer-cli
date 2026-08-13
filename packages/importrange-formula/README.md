# @univer/importrange-formula

Univerfile 内跨 Unit range 引用使用的 formula plugin。它通过 Univer SDK formula API 与 Collaboration SDK
resource reference model 解析引用，不负责文件寻址、网络 transport 或 persistence。

该 package 由 browser composition 注册，不作为独立 application 发布。

```bash
pnpm --filter @univer/importrange-formula test
pnpm --filter @univer/importrange-formula typecheck
```
