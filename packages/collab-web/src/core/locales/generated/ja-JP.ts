import collaborationClient from "@univerjs-pro/collaboration-client/locale/ja-JP";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ja-JP";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/ja-JP";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/ja-JP";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ja-JP";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ja-JP");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
