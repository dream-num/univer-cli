import collaborationClient from "@univerjs-pro/collaboration-client/locale/zh-HK";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/zh-HK";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/zh-HK";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/zh-HK";
import exchangeClient from "@univerjs-pro/exchange-client/locale/zh-HK";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("zh-HK");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
