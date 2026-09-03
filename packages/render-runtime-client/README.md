# @univer/render-runtime-client

供 Univer CLI screenshot、Unit PDF print、layout lint 与 SVG text measurement 使用的 machine Render Page bundle 入口。
标准 Univer composition 与 `window.__univerRenderPage` protocol 由版本匹配的
`@univer-cli/univer-render-page` 提供，本 package 只负责页面容器和构建产物。

browser 的安装、启动、page orchestration 与输出文件由 Univer CLI SDK 和 application adapter
负责。

```bash
pnpm --filter @univer/render-runtime-client typecheck
pnpm --filter @univer/render-runtime-client build
```
