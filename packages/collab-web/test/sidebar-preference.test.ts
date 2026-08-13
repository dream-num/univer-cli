// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  persistSidebarCollapsed,
  resolveSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY
} from "../src/sidebar-preference";

describe("collab-web Sidebar preference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("persists and resolves an explicit collapsed preference", () => {
    persistSidebarCollapsed(true);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");
    expect(resolveSidebarCollapsed()).toBe(true);

    persistSidebarCollapsed(false);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("false");
    expect(resolveSidebarCollapsed()).toBe(false);
  });

  it("defaults to expanded for missing or invalid preferences", () => {
    expect(resolveSidebarCollapsed()).toBe(false);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "collapsed");
    expect(resolveSidebarCollapsed()).toBe(false);
  });

  it("falls back safely when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(resolveSidebarCollapsed()).toBe(false);
    expect(() => persistSidebarCollapsed(true)).not.toThrow();
  });
});
