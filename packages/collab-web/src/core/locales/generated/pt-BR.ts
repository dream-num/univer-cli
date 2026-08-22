import collaborationClient from "@univerjs-pro/collaboration-client/locale/pt-BR";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/pt-BR";
import editHistoryLoader from "@univerjs-pro/edit-history-loader/locale/pt-BR";
import editHistoryViewer from "@univerjs-pro/edit-history-viewer/locale/pt-BR";
import exchangeClient from "@univerjs-pro/exchange-client/locale/pt-BR";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("pt-BR");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, editHistoryLoader, editHistoryViewer, exchangeClient]);
}
