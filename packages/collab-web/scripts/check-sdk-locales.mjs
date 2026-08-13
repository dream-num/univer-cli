import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const presetRoot = resolve(clientRoot, "../render-preset");
const CONTENT_LOCALE_PACKAGE_COUNT = 60;
const CLIENT_LOCALE_PACKAGE_COUNT = 3;
const SDK_LOCALE_PACKAGE_COUNT = CONTENT_LOCALE_PACKAGE_COUNT + CLIENT_LOCALE_PACKAGE_COUNT;
const locales = [
  "en-US",
  "fr-FR",
  "zh-CN",
  "ru-RU",
  "zh-TW",
  "zh-HK",
  "vi-VN",
  "ja-JP",
  "ko-KR",
  "es-ES",
  "ca-ES",
  "sk-SK",
  "pt-BR",
  "de-DE",
  "it-IT",
  "id-ID",
  "pl-PL"
];
const failures = [];

for (const locale of locales) {
  verifyGeneratedImports(
    resolve(presetRoot, "src/locales/generated", `${locale}.ts`),
    presetRoot,
    CONTENT_LOCALE_PACKAGE_COUNT,
    locale
  );
  verifyGeneratedImports(
    resolve(clientRoot, "src/core/locales/generated", `${locale}.ts`),
    clientRoot,
    CLIENT_LOCALE_PACKAGE_COUNT,
    locale
  );
}

if (failures.length > 0) {
  throw new Error(`Gateway Human View SDK locale coverage failed:\n${failures.join("\n")}`);
}

console.log(
  `Verified ${SDK_LOCALE_PACKAGE_COUNT} SDK package locale exports across ${locales.length} Gateway locales.`
);

function verifyGeneratedImports(file, packageOwnerRoot, expectedCount, locale) {
  const source = readFileSync(file, "utf8");
  const specifiers = [...source.matchAll(/from "([^"\n]+\/locale\/[^"\n]+)"/gu)].map(
    (match) => match[1]
  );
  if (specifiers.length !== expectedCount) {
    failures.push(
      `${file}: expected ${expectedCount} package locales for ${locale}, found ${specifiers.length}`
    );
  }
  for (const specifier of specifiers) {
    verifyLocaleExport(packageOwnerRoot, specifier, locale);
  }
}

function verifyLocaleExport(packageOwnerRoot, specifier, locale) {
  const packageName = specifier.slice(0, specifier.indexOf("/locale/"));
  const packageRoot = resolve(packageOwnerRoot, "node_modules", packageName);
  const manifestPath = resolve(packageRoot, "package.json");
  if (!existsSync(manifestPath)) {
    failures.push(`${packageName} · ${locale}: package is not installed for ${packageOwnerRoot}`);
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const localeExport = manifest.exports?.["./locale/*"];
  const targets =
    typeof localeExport === "string"
      ? { default: localeExport }
      : localeExport && typeof localeExport === "object"
        ? localeExport
        : undefined;
  if (targets === undefined) {
    failures.push(`${packageName} · ${locale}: package has no ./locale/* export`);
    return;
  }

  for (const [condition, target] of Object.entries(targets)) {
    if (typeof target !== "string") {
      continue;
    }
    const exportedFile = resolve(packageRoot, target.replaceAll("*", locale));
    if (!existsSync(exportedFile)) {
      failures.push(`${packageName} · ${locale}: missing ${condition} export ${target}`);
    }
  }
}
