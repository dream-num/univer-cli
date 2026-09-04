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
import { structuralDiffItemLabel } from "../../unit-comparison-viewer/src/shared/structural-diff-item-label";

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
      for (const key of ["worksheet", "workbook", "scopeLabel", "displayModeLabel", "content", "formatting", "searchChanges"] as const) {
        expect(messages.diff[key].trim(), `${locale.tag}:${key}`).not.toBe("");
        if (locale.tag !== "en-US") expect(messages.diff[key], `${locale.tag}:${key}`).not.toBe(english.diff[key]);
      }
      expect(messages.diff.showFormulas, `${locale.tag}:formula display`).toBeTruthy();
      if (locale.tag !== "en-US") expect(messages.diff.showFormulas).not.toBe("Show formulas");
      expect(shapeOf(messages), locale.tag).toEqual(authority);
      expect(messages.topbar.segDiff, `${locale.tag} compare label`).toBe(messages.diff.compare);
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
      for (const key of ["formulaName", "rowCount", "columnCount", "h", "w", "hd", "ia", "bg", "rgb", "cl", "fs", "bl", "it", "rangeInfo", "startRow", "endRow", "startColumn", "endColumn", "fieldsConfig"]) {
        expect(messages.diff.changePath([key]), `${locale.tag}:${key}`).not.toBe(key);
      }
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
    }, undefined, t().diff);

    expect(label).toBe(`${t().diff.entityAt("board-element", 3)} · ${t().diff.moved}`);
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
    }, undefined, t().diff);

    expect(label).toBe(
      `${t().diff.changeValue("block-range", ["type"], "quote")} · 发布前需要完成安全审查`
    );
    expect(label).not.toContain("opaque-quote-id");
    await setLang("en-US");
  });

  it("localizes a transition reference instead of displaying its target ID", async () => {
    await setLang("zh-CN");
    const item = {
      id: "slide-transition-ref:update:slide-1",
      stableId: "slide-1",
      category: "slide-transition-ref",
      entityType: "slide-transition-ref",
      path: ["slide-transition-ref", "slide-1"],
      label: "transition-private-id",
      kind: "update" as const,
      moved: false,
      changes: [],
      position: { left: 0, right: 0 },
      values: { left: "transition-old-id", right: "transition-private-id" }
    };
    expect(structuralDiffItemLabel(item, undefined, t().diff)).toBe(t().diff.entityAt("slide-transition-ref", 1));
    expect(structuralDiffItemLabel(item, "Launch overview", t().diff)).toBe("Launch overview");
    expect(item.values.right).toBe("transition-private-id");
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
