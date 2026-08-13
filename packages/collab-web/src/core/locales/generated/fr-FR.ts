import collaborationClient from "@univerjs-pro/collaboration-client/locale/fr-FR";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/fr-FR";
import exchangeClient from "@univerjs-pro/exchange-client/locale/fr-FR";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("fr-FR");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient]);
}
