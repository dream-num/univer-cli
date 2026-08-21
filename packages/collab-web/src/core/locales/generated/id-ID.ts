import collaborationClient from "@univerjs-pro/collaboration-client/locale/id-ID";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/id-ID";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/id-ID";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/id-ID";
import exchangeClient from "@univerjs-pro/exchange-client/locale/id-ID";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("id-ID");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
