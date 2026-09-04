// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LANG_STORAGE_KEY,
  LOCALE_MANIFEST,
  currentLang,
  loadMessages,
  normalizeLang,
  persistLang,
  resolveLang,
  setLang,
  t
} from "../src/i18n";

describe("resolveLang", () => {
  afterEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
  });

  it("prefers the URL ?lang= over everything else", () => {
    history.replaceState(null, "", "/?lang=en-US");
    localStorage.setItem(LANG_STORAGE_KEY, "zh-CN");
    expect(resolveLang()).toBe("en-US");
  });

  it("falls back to localStorage when the URL has no lang", () => {
    localStorage.setItem(LANG_STORAGE_KEY, "zh-CN");
    expect(resolveLang()).toBe("zh-CN");
  });

  it("falls back to navigator.language, then en-US", () => {
    // jsdom's navigator.language is "en-US"; with no URL/storage hint that's what wins.
    expect(resolveLang()).toBe("en-US");
  });

  it("treats unavailable localStorage as best-effort", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => persistLang("fr-FR")).not.toThrow();
    write.mockRestore();
  });

  it("tolerates bare zh/en prefixes", () => {
    history.replaceState(null, "", "/?lang=zh");
    expect(resolveLang()).toBe("zh-CN");
    history.replaceState(null, "", "/?lang=en");
    expect(resolveLang()).toBe("en-US");
  });

  it("skips an unrecognized source instead of failing", () => {
    history.replaceState(null, "", "/?lang=ar-SA");
    localStorage.setItem(LANG_STORAGE_KEY, "zh-CN");
    expect(resolveLang()).toBe("zh-CN");
  });
});

describe("setLang / t", () => {
  it("switches the live message table", async () => {
    await setLang("zh-CN");
    expect(currentLang()).toBe("zh-CN");
    expect(t().topbar.currentVersion).toBe("当前版本");
    await setLang("en-US");
    expect(currentLang()).toBe("en-US");
    expect(t().topbar.currentVersion).toBe("Current version");
  });

  it("keeps the canonical manifest unique and every shell table structurally complete", async () => {
    expect(LOCALE_MANIFEST).toHaveLength(17);
    expect(new Set(LOCALE_MANIFEST.map(({ tag }) => tag)).size).toBe(17);
    expect(new Set(LOCALE_MANIFEST.map(({ sdkLocale }) => sdkLocale)).size).toBe(17);
    expect(LOCALE_MANIFEST.map(({ tag }) => tag)).not.toContain("ar-SA");
    expect(LOCALE_MANIFEST.map(({ tag }) => tag)).not.toContain("fa-IR");

    const english = await loadMessages("en-US");
    const authority = shapeOf(english);
    for (const locale of LOCALE_MANIFEST) {
      const messages = await loadMessages(locale.tag);
      expect(shapeOf(messages), locale.tag).toEqual(authority);
      expect(messages.topbar.segDiff, `${locale.tag}:compare label`).not.toBe("");
      expect(messages.diff.comparisonFailed, `${locale.tag}:comparison failure`).not.toBe("");
      expect(messages.diff.incompletePage, `${locale.tag}:incomplete page`).not.toBe("");
      expect(messages.diff.revision(8), `${locale.tag}:revision`).toContain("8");
      expect(normalizeLang(locale.tag.replace("-", "_"))).toBe(locale.tag);
    }
  });

  it("renders parameterized entries per locale", async () => {
    await setLang("zh-CN");
    expect(t().time.minutesAgo(3)).toBe("3 分钟前");
    await setLang("en-US");
    expect(t().time.minutesAgo(3)).toBe("3 min ago");
  });

});

/** Nested key/type skeleton (function arity-insensitive) for cross-locale comparison. */
function shapeOf(value: unknown): unknown {
  if (typeof value === "function") {
    return "fn";
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, shapeOf(v)])
    );
  }
  return typeof value;
}
