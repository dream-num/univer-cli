import collaborationClient from "@univerjs-pro/collaboration-client/locale/sk-SK";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/sk-SK";
import exchangeClient from "@univerjs-pro/exchange-client/locale/sk-SK";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("sk-SK");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient]);
}
