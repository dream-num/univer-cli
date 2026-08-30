import collaborationClient from "@univerjs-pro/collaboration-client/locale/pl-PL";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/pl-PL";
import exchangeClient from "@univerjs-pro/exchange-client/locale/pl-PL";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/pl-PL";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("pl-PL");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient, sheetsHistoryUI]);
}
