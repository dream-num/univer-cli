// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPEARANCE_STORAGE_KEY, applyDocumentAppearance, setAppearance } from "../src/appearance";
import { LANG_STORAGE_KEY, currentLang, setLang } from "../src/i18n";
import { App } from "../src/ui/app";

vi.mock("@univer/collab-gateway-contract", () => {
  class MockWorktreeControlClient {
    public listUnits(): Promise<
      Array<{ unitId: string; type: number; name: string; headRev: number }>
    > {
      return Promise.resolve([{ unitId: "unit_1", type: 2, name: "Demo Sheet", headRev: 1 }]);
    }

    public listWorktrees(): Promise<[]> {
      return Promise.resolve([]);
    }
  }

  return {
    encodeUniverfile: (univerfile: string) => encodeURIComponent(univerfile),
    UNIT_TYPE_DOC: 1,
    UNIT_TYPE_SHEET: 2,
    UNIT_TYPE_SLIDE: 3,
    UNIT_TYPE_BASE: 5,
    UNIT_TYPE_BOARD: 6,
    GATEWAY_CAPABILITY_UNIVERFILE_VIEWER: "univerfile.viewer",
    fetchGatewayDescriptor: () =>
      Promise.resolve({
        protocolVersion: 1,
        capabilities: ["univerfile.read", "univerfile.viewer"],
        viewUrl: "/?file=abc"
      }),
    WorktreeControlClient: MockWorktreeControlClient
  };
});

vi.mock("../src/core/events", () => ({
  openEventChannel: () => ({ close: () => undefined })
}));

const localeMock = vi.hoisted(() => ({
  load: (_locale: string): Promise<unknown> => Promise.resolve({})
}));

vi.mock("../src/core/locales/generated/load", () => ({
  loadViewerLocale: (locale: string) => localeMock.load(locale)
}));

const createViewerCalls: Array<{ locale: string; darkMode: boolean }> = [];
const setDarkModeCalls: boolean[] = [];
const setLocaleCalls: string[] = [];

vi.mock("../src/core/viewer", () => ({
  createPreviewViewer: () =>
    Promise.resolve({
      setDarkMode: () => undefined,
      setLocale: (locale: string) => {
        setLocaleCalls.push(locale);
        return Promise.resolve();
      },
      dispose: () => undefined
    }),
  createViewer: (options: { locale: string; darkMode: boolean }) => {
    createViewerCalls.push({ locale: options.locale, darkMode: options.darkMode });
    return Promise.resolve({
      setDarkMode: (darkMode: boolean) => setDarkModeCalls.push(darkMode),
      setLocale: (locale: string) => {
        setLocaleCalls.push(locale);
        return Promise.resolve();
      },
      dispose: () => undefined
    });
  }
}));

function getRoot(): HTMLElement {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("missing root");
  }
  return root;
}

function newApp(mode: "standalone" | "embedded"): App {
  const app = new App(
    getRoot(),
    location.origin,
    "/tmp/demo.univer",
    null,
    "unit_1",
    "trunk",
    mode === "embedded" ? false : null,
    mode
  );
  apps.push(app);
  return app;
}

const apps: App[] = [];

describe("collab-web shell i18n", () => {
  beforeEach(async () => {
    document.body.innerHTML = '<main id="root"></main>';
    history.replaceState(null, "", "/");
    localStorage.clear();
    createViewerCalls.length = 0;
    setDarkModeCalls.length = 0;
    setLocaleCalls.length = 0;
    localeMock.load = () => Promise.resolve({});
    setAppearance("light");
    applyDocumentAppearance();
    await setLang("en-US");
  });

  afterEach(async () => {
    // Unmount React roots while their portals are still attached; wiping body
    // first would orphan them and crash Base UI's portal cleanup.
    for (const app of apps.splice(0)) {
      app.dispose();
    }
    document.body.innerHTML = "";
    localStorage.clear();
    setAppearance("light");
    applyDocumentAppearance();
    await setLang("en-US");
  });

  it("renders the shell in English when the language is en-US", async () => {
    await setLang("en-US");
    await newApp("standalone").start();

    expect(document.querySelector(".topbar")?.textContent).toContain("Current version");
    expect(document.querySelector(".sidebar")?.textContent).toContain("Files");
    expect(document.querySelector(".overlay-text")?.textContent).toBe("Loading…");
  });

  it("renders the shell in Chinese when the language is zh-CN", async () => {
    await setLang("zh-CN");
    await newApp("standalone").start();

    expect(document.querySelector(".topbar")?.textContent).toContain("当前版本");
    expect(document.querySelector(".sidebar")?.textContent).toContain("文件");
  });

  it("shows the bottom-left settings entry in standalone mode only", async () => {
    await setLang("zh-CN");
    await newApp("standalone").start();
    expect(document.querySelector(".sidebar .settings-row")).not.toBeNull();

    document.body.innerHTML = '<main id="root"></main>';
    await newApp("embedded").start();
    expect(document.querySelector(".settings-row")).toBeNull();
  });

  it("opens a language menu from settings, current language checked", async () => {
    await setLang("zh-CN");
    await newApp("standalone").start();
    expect(document.querySelector(".settings-menu")).toBeNull();

    (document.querySelector(".settings-row") as HTMLElement).click();

    // Base UI opens the menu on the next animation frame.
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".settings-menu .settings-opt")).toHaveLength(19)
    );
    const active = [...document.querySelectorAll(".settings-opt.active")].find((option) =>
      option.textContent?.includes("中文")
    );
    expect(active?.textContent).toContain("中文");
    const light = [...document.querySelectorAll(".settings-opt")].find((option) =>
      option.textContent?.includes("浅色")
    );
    const dark = [...document.querySelectorAll(".settings-opt")].find((option) =>
      option.textContent?.includes("深色")
    );
    expect(light?.querySelector(".lucide-sun")).not.toBeNull();
    expect(dark?.querySelector(".lucide-moon")).not.toBeNull();
  });

  it("localizes appearance settings in English", async () => {
    await setLang("en-US");
    await newApp("standalone").start();

    (document.querySelector(".settings-row") as HTMLElement).click();
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".settings-menu .settings-opt")).toHaveLength(19)
    );
    const menu = document.querySelector(".settings-menu");
    expect(menu?.textContent).toContain("Appearance");
    expect(menu?.textContent).toContain("Light");
    expect(menu?.textContent).toContain("Dark");
  });

  it("switches the shell and current Univer to dark mode without rebuilding", async () => {
    await setLang("zh-CN");
    await newApp("standalone").start();
    expect(createViewerCalls).toEqual([{ locale: "zhCN", darkMode: false }]);

    (document.querySelector(".settings-row") as HTMLElement).click();
    await vi.waitFor(() =>
      expect(document.querySelector(".settings-menu .settings-opt")).not.toBeNull()
    );
    const dark = [...document.querySelectorAll(".settings-opt")].find((option) =>
      option.textContent?.includes("深色")
    ) as HTMLElement;
    dark.click();

    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("gateway-dark")).toBe(true);
      expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
    });
    expect(createViewerCalls).toHaveLength(1);
    expect(setDarkModeCalls.at(-1)).toBe(true);
  });

  it("hot-switches Univer without rebuilding it", async () => {
    await setLang("zh-CN");
    await newApp("standalone").start();
    expect(createViewerCalls.map((c) => c.locale)).toEqual(["zhCN"]);

    (document.querySelector(".settings-row") as HTMLElement).click();
    await vi.waitFor(() =>
      expect(document.querySelector(".settings-menu .settings-opt")).not.toBeNull()
    );
    const english = [...document.querySelectorAll(".settings-opt")].find((o) =>
      o.textContent?.includes("English")
    ) as HTMLElement;
    english.click();
    await vi.waitFor(() => expect(setLocaleCalls.at(-1)).toBe("enUS"));
    expect(createViewerCalls).toHaveLength(1);
  });

  it("starts the embedded Univer in the language the URL asks for", async () => {
    history.replaceState(null, "", "/?lang=en-US");
    await setLang("en-US");
    await newApp("embedded").start();
    expect(createViewerCalls.map((c) => c.locale)).toEqual(["enUS"]);
  });

  it("picks a language from the menu: re-renders, persists, and mirrors to the URL", async () => {
    await setLang("zh-CN");
    await newApp("standalone").start();
    (document.querySelector(".settings-row") as HTMLElement).click();
    await vi.waitFor(() =>
      expect(document.querySelector(".settings-menu .settings-opt")).not.toBeNull()
    );

    const english = [...document.querySelectorAll(".settings-opt")].find((o) =>
      o.textContent?.includes("English")
    ) as HTMLElement;
    english.click();

    // The store updates synchronously, but React flushes portal updates async.
    await vi.waitFor(() => {
      expect(document.querySelector(".topbar")?.textContent).toContain("Current version");
      expect(document.querySelector(".settings-menu")).toBeNull();
    });
    expect(document.querySelector(".sidebar")?.textContent).toContain("Files");
    expect(document.querySelector(".overlay-text")?.textContent).toBe("Loading…");
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe("en-US");
    expect(location.search).toContain("lang=en-US");
    expect(document.documentElement.lang).toBe("en-US");
    expect(document.title).toBe("demo");
  });

  it("keeps an explicit ?lang= in the URL across view-driven URL rewrites", async () => {
    history.replaceState(null, "", "/?file=%2Ftmp%2Fdemo.univer&lang=zh-CN");
    await setLang("zh-CN");
    const app = newApp("standalone");
    await app.start();

    // start() rewrites the URL via syncUrl(); the explicit lang must survive.
    expect(location.search).toContain("lang=zh-CN");
  });

  it("rolls back when the target SDK locale fails to load", async () => {
    await setLang("zh-CN");
    const app = newApp("standalone");
    await app.start();
    localeMock.load = (locale) =>
      locale === "frFR" ? Promise.reject(new Error("missing fr locale")) : Promise.resolve({});

    await app.chooseLang("fr-FR");

    expect(currentLang()).toBe("zh-CN");
    expect(createViewerCalls).toHaveLength(1);
    expect(setLocaleCalls.at(-1)).toBe("zhCN");
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBeNull();
    expect(location.search).not.toContain("lang=fr-FR");
  });

  it("commits only the latest rapid language selection", async () => {
    await setLang("zh-CN");
    const app = newApp("standalone");
    await app.start();
    let resolveFrench: (() => void) | undefined;
    localeMock.load = (locale) =>
      locale === "frFR"
        ? new Promise((resolve) => {
            resolveFrench = () => resolve({});
          })
        : Promise.resolve({});

    const french = app.chooseLang("fr-FR");
    const english = app.chooseLang("en-US");
    await english;
    resolveFrench?.();
    await french;

    expect(currentLang()).toBe("en-US");
    expect(createViewerCalls).toHaveLength(1);
    expect(setLocaleCalls.at(-1)).toBe("enUS");
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe("en-US");
  });
});
