import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = resolve(ROOT, "src/core/locales/generated");
const CHECK = process.argv.includes("--check");
const LOCALES = [
  ["en-US", "enUS"],
  ["fr-FR", "frFR"],
  ["zh-CN", "zhCN"],
  ["ru-RU", "ruRU"],
  ["zh-TW", "zhTW"],
  ["zh-HK", "zhHK"],
  ["vi-VN", "viVN"],
  ["ja-JP", "jaJP"],
  ["ko-KR", "koKR"],
  ["es-ES", "esES"],
  ["ca-ES", "caES"],
  ["sk-SK", "skSK"],
  ["pt-BR", "ptBR"],
  ["de-DE", "deDE"],
  ["it-IT", "itIT"],
  ["id-ID", "idID"],
  ["pl-PL", "plPL"]
];

function localeModule(tag) {
  return `import collaborationClient from "@univerjs-pro/collaboration-client/locale/${tag}";\nimport collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/${tag}";\nimport exchangeClient from "@univerjs-pro/exchange-client/locale/${tag}";\nimport { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";\nimport type { ILanguagePack } from "@univerjs/core";\n\nexport default async function loadLocale(): Promise<ILanguagePack> {\n  const content = await loadContentLocale("${tag}");\n  return mergeLocalePacks([content, collaborationClient, collaborationClientUI, exchangeClient]);\n}\n`;
}

function loaderModule() {
  const loaders = LOCALES.map(
    ([tag, sdkLocale]) =>
      `  ${sdkLocale}: () => import("./${tag}.js").then(({ default: load }) => load())`
  ).join(",\n");
  return `import type { ILanguagePack, LocaleType } from "@univerjs/core";\n\nconst loaders: Partial<Record<LocaleType, () => Promise<ILanguagePack>>> = {\n${loaders}\n};\n\nconst cache = new Map<LocaleType, Promise<ILanguagePack>>();\n\nexport function loadViewerLocale(locale: LocaleType): Promise<ILanguagePack> {\n  const cached = cache.get(locale);\n  if (cached !== undefined) {\n    return cached;\n  }\n  const loader = loaders[locale];\n  if (loader === undefined) {\n    return Promise.reject(new Error(\`Unsupported Gateway Viewer locale: \${locale}\`));\n  }\n  const pending = loader().catch((error: unknown) => {\n    cache.delete(locale);\n    throw error;\n  });\n  cache.set(locale, pending);\n  return pending;\n}\n`;
}

function emit(relativePath, content) {
  const outputPath = resolve(OUTPUT_DIR, relativePath);
  if (CHECK) {
    let current = "";
    try {
      current = readFileSync(outputPath, "utf8");
    } catch {
      // Report the same freshness error as changed generated content.
    }
    if (current !== content) {
      throw new Error(`Generated viewer locale file is stale: ${outputPath}`);
    }
    return;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

for (const [tag] of LOCALES) {
  emit(`${tag}.ts`, localeModule(tag));
}
emit("load.ts", loaderModule());

console.log(`${CHECK ? "Verified" : "Generated"} ${LOCALES.length} viewer locale modules.`);
