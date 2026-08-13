# @univer/render-preset

Viewer 与 machine render runtime 共用的 Univer SDK browser composition。它负责：

- 注册 Sheet、Doc、Slide、Base、Board、drawing、formula 和 UI plugin；
- 固定 plugin ordering 与 asset I/O ownership；
- 合并 content locale；
- 暴露 browser composition facade 和 style entry。

调用方必须显式提供 container、runtime license、asset I/O owner 与 workbench chrome mode。该 package 不负责
browser lifecycle、Univerfile 读取、Gateway transport 或截图输出。

```bash
pnpm --filter @univer/render-preset test
pnpm --filter @univer/render-preset typecheck
```
