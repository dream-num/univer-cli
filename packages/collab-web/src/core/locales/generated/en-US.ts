import collaborationClient from "@univerjs-pro/collaboration-client/locale/en-US";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import exchangeClient from "@univerjs-pro/exchange-client/locale/en-US";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("en-US");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient]);
}
