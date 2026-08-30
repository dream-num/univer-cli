import collaborationClient from "@univerjs-pro/collaboration-client/locale/zh-TW";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/zh-TW";
import exchangeClient from "@univerjs-pro/exchange-client/locale/zh-TW";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/zh-TW";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("zh-TW");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient, sheetsHistoryUI]);
}
