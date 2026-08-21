import collaborationClient from "@univerjs-pro/collaboration-client/locale/ru-RU";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ru-RU";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/ru-RU";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/ru-RU";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ru-RU";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ru-RU");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
