import collaborationClient from "@univerjs-pro/collaboration-client/locale/zh-CN";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/zh-CN";
import exchangeClient from "@univerjs-pro/exchange-client/locale/zh-CN";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/zh-CN";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("zh-CN");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient, sheetsHistoryUI]);
}
