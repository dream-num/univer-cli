import collaborationClient from "@univerjs-pro/collaboration-client/locale/vi-VN";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/vi-VN";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/vi-VN";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/vi-VN";
import exchangeClient from "@univerjs-pro/exchange-client/locale/vi-VN";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("vi-VN");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
