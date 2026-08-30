import collaborationClient from "@univerjs-pro/collaboration-client/locale/ca-ES";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ca-ES";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ca-ES";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/ca-ES";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ca-ES");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient, sheetsHistoryUI]);
}
