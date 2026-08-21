import collaborationClient from "@univerjs-pro/collaboration-client/locale/it-IT";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/it-IT";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/it-IT";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/it-IT";
import exchangeClient from "@univerjs-pro/exchange-client/locale/it-IT";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("it-IT");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
