// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  applyDocumentAppearance,
  currentAppearance,
  persistAppearance,
  resolveAppearance,
  setAppearance
} from "../src/appearance";

describe("collab-web appearance", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    setAppearance("light");
    applyDocumentAppearance();
  });

  it("persists and resolves an explicit dark preference", () => {
    persistAppearance("dark");
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
    expect(resolveAppearance()).toBe("dark");
  });

  it("applies the shell class and browser color scheme", () => {
    setAppearance("dark");
    applyDocumentAppearance();
    expect(currentAppearance()).toBe("dark");
    expect(document.documentElement.classList.contains("gateway-dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    setAppearance("light");
    applyDocumentAppearance();
    expect(document.documentElement.classList.contains("gateway-dark")).toBe(false);
  });

  it("falls back safely when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(resolveAppearance()).toBe("light");
    expect(() => persistAppearance("dark")).not.toThrow();
  });
});
