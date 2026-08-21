import collaborationClient from "@univerjs-pro/collaboration-client/locale/zh-TW";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/zh-TW";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/zh-TW";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/zh-TW";
import exchangeClient from "@univerjs-pro/exchange-client/locale/zh-TW";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("zh-TW");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
