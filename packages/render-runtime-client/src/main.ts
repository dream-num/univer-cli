import { createPresetRenderUniver, mountUniverRenderPage } from "@univer-cli/univer-render-page";

const container = document.querySelector<HTMLElement>("#app");
if (container === null) throw new Error("render page requires an #app container");

void mountUniverRenderPage({ container, createUniver: createPresetRenderUniver });
