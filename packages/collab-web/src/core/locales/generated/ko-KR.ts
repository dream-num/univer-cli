import collaborationClient from "@univerjs-pro/collaboration-client/locale/ko-KR";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ko-KR";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ko-KR";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ko-KR");
  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient]);
}
