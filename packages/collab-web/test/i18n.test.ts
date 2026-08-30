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
import { EN_US_MESSAGES } from "../src/i18n/locales/en-US";
import { ZH_CN_MESSAGES } from "../src/i18n/locales/zh-CN";
import { STRUCTURAL_ENTITY_CATEGORIES } from "../src/i18n/locales/structural-entity-labels";
import { structuralDiffItemLabel } from "../src/ui/structural-diff-item-label";

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

  it("keeps both locale tables structurally identical", () => {
    expect(shapeOf(EN_US_MESSAGES)).toEqual(shapeOf(ZH_CN_MESSAGES));
  });

  it("keeps the canonical manifest unique and every shell table structurally complete", async () => {
    expect(LOCALE_MANIFEST).toHaveLength(17);
    expect(new Set(LOCALE_MANIFEST.map(({ tag }) => tag)).size).toBe(17);
    expect(new Set(LOCALE_MANIFEST.map(({ sdkLocale }) => sdkLocale)).size).toBe(17);
    expect(LOCALE_MANIFEST.map(({ tag }) => tag)).not.toContain("ar-SA");
    expect(LOCALE_MANIFEST.map(({ tag }) => tag)).not.toContain("fa-IR");

    const authority = shapeOf(EN_US_MESSAGES);
    for (const locale of LOCALE_MANIFEST) {
      const messages = await loadMessages(locale.tag);
      expect(shapeOf(messages), locale.tag).toEqual(authority);
      expect(messages.topbar.segDiff, `${locale.tag} compare label`).toBe(messages.diff.compare);
      for (const category of STRUCTURAL_ENTITY_CATEGORIES) {
        expect(messages.diff.entity(category), `${locale.tag}:${category}`).not.toBe("");
      }
      for (const category of [
        "paragraph",
        "slide-element",
        "base",
        "field",
        "record",
        "view",
        "board-page",
        "board-element"
      ]) {
        expect(messages.diff.entity(category), `${locale.tag}:${category}`).not.toBe(
          messages.diff.content
        );
      }
      expect(messages.diff.entityAt("paragraph", 3), `${locale.tag}:entityAt`).toContain(
        messages.diff.entity("paragraph")
      );
      expect(messages.diff.moved, `${locale.tag}:moved`).not.toBe("");
      expect(normalizeLang(locale.tag.replace("-", "_"))).toBe(locale.tag);
    }
  });

  it("renders parameterized entries per locale", async () => {
    await setLang("zh-CN");
    expect(t().time.minutesAgo(3)).toBe("3 分钟前");
    await setLang("en-US");
    expect(t().time.minutesAgo(3)).toBe("3 min ago");
  });

  it("keeps stable IDs out of visible structural labels and localizes movement", async () => {
    await setLang("zh-CN");
    const label = structuralDiffItemLabel({
      id: "board-element:update:element-opaque-id",
      stableId: "element-opaque-id",
      category: "board-element",
      entityType: "board-element",
      path: ["board-element", "element-opaque-id"],
      label: "element-opaque-id",
      kind: "update",
      moved: true,
      changes: [],
      position: { left: 1, right: 2 },
      values: { left: {}, right: {} }
    });

    expect(label).toBe("第 3 个画板元素 · 已移动");
    expect(label).not.toContain("element-opaque-id");
    await setLang("en-US");
  });

  it("uses Doc block semantics and content instead of generic range IDs", async () => {
    await setLang("zh-CN");
    const label = structuralDiffItemLabel({
      id: "block-range:update:opaque-quote-id",
      stableId: "opaque-quote-id",
      category: "block-range",
      entityType: "block-range",
      path: ["block-range", "opaque-quote-id"],
      label: "发布前需要完成安全审查",
      kind: "update",
      moved: false,
      changes: [{ path: ["type"], kind: "update", valueType: "text", before: "callout", after: "quote" }],
      position: { left: 1, right: 1 },
      values: {
        left: { type: "callout" },
        right: { type: "quote" }
      }
    });

    expect(label).toBe("引用 · 发布前需要完成安全审查");
    expect(label).not.toContain("opaque-quote-id");
    await setLang("en-US");
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
