# @univer/render-runtime-client

供 Univer CLI screenshot、layout lint 与 SVG text measurement 使用的 machine browser runtime。它基于
`@univer/render-preset` 创建无协作 Univer instance，并通过 `window.__univerRenderRuntime` 暴露受控 page API。

runtime 支持 Unit load/dispose、Sheet/Doc/Slide layout capture、五类 Unit rendering、contact sheet composition
和 text measurement。browser 的安装、启动、page orchestration 与输出文件由 Univer CLI SDK 和 application
adapter 负责。

```bash
pnpm --filter @univer/render-runtime-client test
pnpm --filter @univer/render-runtime-client typecheck
pnpm --filter @univer/render-runtime-client build
```
