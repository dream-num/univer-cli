import collaborationClient from "@univerjs-pro/collaboration-client/locale/zh-CN";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/zh-CN";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/zh-CN";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/zh-CN";
import exchangeClient from "@univerjs-pro/exchange-client/locale/zh-CN";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("zh-CN");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
