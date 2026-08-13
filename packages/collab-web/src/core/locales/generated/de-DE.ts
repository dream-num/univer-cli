import collaborationClient from "@univerjs-pro/collaboration-client/locale/de-DE";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/de-DE";
import exchangeClient from "@univerjs-pro/exchange-client/locale/de-DE";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("de-DE");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient]);
}
