import collaborationClient from "@univerjs-pro/collaboration-client/locale/ca-ES";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ca-ES";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/ca-ES";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/ca-ES";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ca-ES";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ca-ES");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
