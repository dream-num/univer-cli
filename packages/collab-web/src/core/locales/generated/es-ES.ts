import collaborationClient from "@univerjs-pro/collaboration-client/locale/es-ES";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/es-ES";
import exchangeClient from "@univerjs-pro/exchange-client/locale/es-ES";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("es-ES");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient]);
}
