import type { Worktree } from "@univer/collab-gateway-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyDocumentAppearance, setAppearance } from "../src/appearance";
import { setLang } from "../src/i18n";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "../src/sidebar-preference";
import { App } from "../src/ui/app";

const mockState = vi.hoisted(() => ({
  controlOptions: [] as unknown[],
  descriptorEndpoints: [] as string[],
  viewerOptions: [] as unknown[],
  viewerResolvers: [] as Array<() => void>,
  viewerDarkModeCalls: [] as boolean[],
  deferViewer: false,
  univerfileOpen: undefined as (() => void) | undefined,
  univerfileWorktree: undefined as ((event: { worktree: Worktree }) => void) | undefined,
  worktrees: [] as Worktree[]
}));

vi.mock("@univer/collab-gateway-contract", () => {
  class MockWorktreeControlClient {
    public constructor(options: unknown) {
      mockState.controlOptions.push(options);
    }

    public listUnits(): Promise<
      Array<{ unitId: string; type: number; name: string; headRev: number }>
    > {
      return Promise.resolve([{ unitId: "unit_1", type: 2, name: "Demo Sheet", headRev: 1 }]);
    }

    public listWorktrees(): Promise<typeof mockState.worktrees> {
      return Promise.resolve(mockState.worktrees);
    }

    public previewMerge(): Promise<{
      error: { code: number; message: string };
      diverged: boolean;
      units: [];
    }> {
      return Promise.resolve({ error: { code: 1, message: "" }, diverged: false, units: [] });
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
    fetchGatewayDescriptor: (input: { endpoint: string; requiredCapability?: string }) => {
      mockState.descriptorEndpoints.push(`${input.endpoint}:${input.requiredCapability ?? "-"}`);
      return Promise.resolve({
        protocolVersion: 1,
        capabilities: ["univerfile.read", "univerfile.viewer"],
        viewUrl: "/?file=abc"
      });
    },
    WorktreeControlClient: MockWorktreeControlClient
  };
});

vi.mock("../src/core/events", () => ({
  openEventChannel: (
    url: string,
    handlers: {
      open?: () => void;
      worktree?: NonNullable<typeof mockState.univerfileWorktree>;
    }
  ) => {
    if (!url.includes("/worktrees/")) {
      mockState.univerfileOpen = handlers.open;
      mockState.univerfileWorktree = handlers.worktree;
    }
    return {
      close: () => undefined
    };
  }
}));

vi.mock("../src/core/locales/generated/load", () => ({
  loadViewerLocale: () => Promise.resolve({})
}));

vi.mock("../src/core/viewer", () => ({
  createPreviewViewer: () =>
    Promise.resolve({
      setDarkMode: () => undefined,
      setLocale: () => Promise.resolve(),
      dispose: () => undefined
    }),
  createViewer: (options: unknown) => {
    mockState.viewerOptions.push(options);
    if (mockState.deferViewer) {
      return new Promise<{
        setDarkMode: (darkMode: boolean) => void;
        setLocale: () => Promise<void>;
        dispose: () => undefined;
      }>((resolve) => {
        mockState.viewerResolvers.push(() =>
          resolve({
            setDarkMode: (darkMode) => mockState.viewerDarkModeCalls.push(darkMode),
            setLocale: () => Promise.resolve(),
            dispose: () => undefined
          })
        );
      });
    }
    return Promise.resolve({
      setDarkMode: (darkMode: boolean) => mockState.viewerDarkModeCalls.push(darkMode),
      setLocale: () => Promise.resolve(),
      dispose: () => undefined
    });
  }
}));

describe("collab-web app shell", () => {
  const apps: App[] = [];
  function track(app: App): App {
    apps.push(app);
    return app;
  }
  beforeEach(async () => {
    await setLang("zh-CN");
    setAppearance("light");
    applyDocumentAppearance();
    localStorage.clear();
    document.body.innerHTML = '<main id="root"></main>';
    history.replaceState(null, "", "/");
    mockState.controlOptions.length = 0;
    mockState.descriptorEndpoints.length = 0;
    mockState.viewerOptions.length = 0;
    mockState.viewerResolvers.length = 0;
    mockState.viewerDarkModeCalls.length = 0;
    mockState.deferViewer = false;
    mockState.univerfileOpen = undefined;
    mockState.univerfileWorktree = undefined;
    mockState.worktrees.length = 0;
  });

  afterEach(async () => {
    // Unmount React roots while their portals are still attached; wiping body
    // first would orphan them and crash Base UI's portal cleanup.
    for (const app of apps.splice(0)) {
      app.dispose();
    }
    document.body.innerHTML = "";
    setAppearance("light");
    applyDocumentAppearance();
    localStorage.clear();
    await setLang("en-US");
  });

  it("uses the univerfile basename without its extension as the browser title", () => {
    const app = track(
      new App(
        getRoot(),
        location.origin,
        "C:\\Users\\demo\\工资计算器.UNIVER",
        null,
        null,
        "trunk",
        null,
        "standalone"
      )
    );

    expect(app.univerfileName).toBe("工资计算器");
    expect(document.title).toBe("工资计算器");
  });

  it("hides the standalone navigation and titlebar in embedded mode", async () => {
    const root = getRoot();
    const app = track(
      new App(root, location.origin, "/tmp/demo.univer", null, "unit_1", "trunk", false, "embedded")
    );

    await app.start();

    expect(root.querySelector(".shell.embedded")).not.toBeNull();
    expect(root.querySelector(".sidebar")).toBeNull();
    expect(root.querySelector(".topbar")).toBeNull();
    expect(root.querySelector(".sidebar-toggle")).toBeNull();
    expect(root.querySelector(".content")).not.toBeNull();
  });

  it("keeps the navigation and titlebar in standalone mode", async () => {
    const root = getRoot();
    const app = track(
      new App(
        root,
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();

    expect(root.querySelector(".shell.embedded")).toBeNull();
    expect(root.querySelector(".sidebar")).not.toBeNull();
    expect(root.querySelector(".topbar")).not.toBeNull();
    expect(root.querySelector(".topbar")?.textContent).toContain("当前版本");
    expect(root.querySelector("svg.univer-logo")?.querySelectorAll("path")).toHaveLength(4);
    expect(root.querySelector(".lucide-folder")).toBeNull();
    expect(root.querySelector(".sidebar > div:first-child")?.classList.contains("h-11")).toBe(true);
    expect(root.querySelector(".sidebar-footer")?.classList.contains("h-9")).toBe(true);
    expect(root.querySelector(".sidebar-body")?.classList.contains("border-b")).toBe(true);
    expect(root.querySelector(".sidebar-footer")?.classList.contains("border-t")).toBe(false);
    expect(root.querySelector(".sidebar")?.textContent).not.toContain("已处理");
    expect(root.querySelector(".topbar")?.classList.contains("min-h-11")).toBe(true);
    expect(root.querySelector(".topbar")?.classList.contains("py-1")).toBe(true);
    expect(root.querySelector('button[aria-label="收起侧边栏"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="展开侧边栏"]')).toBeNull();
  });

  it("collapses from the Sidebar and restores from the Topbar", async () => {
    const root = getRoot();
    const app = track(
      new App(
        root,
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();
    click(root, 'button[aria-label="收起侧边栏"]');

    await waitForUi(() => expect(root.querySelector(".sidebar")).toBeNull());
    const expand = root.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]');
    expect(expand?.classList.contains("absolute")).toBe(true);
    expect(expand?.classList.contains("left-4")).toBe(true);
    expect(root.querySelector(".topbar .sidebar-toggle-spacer")).not.toBeNull();
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");

    click(root, 'button[aria-label="展开侧边栏"]');
    await waitForUi(() => expect(root.querySelector(".sidebar")).not.toBeNull());
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("false");
  });

  it("restores a collapsed Sidebar preference and localizes its visible control", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    const root = getRoot();
    const app = track(
      new App(
        root,
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();
    expect(root.querySelector(".sidebar")).toBeNull();
    expect(root.querySelector('button[aria-label="展开侧边栏"]')).not.toBeNull();

    await app.chooseLang("en-US");
    await waitForUi(() =>
      expect(root.querySelector('button[aria-label="Expand sidebar"]')).not.toBeNull()
    );
  });

  it("peeks the collapsed Sidebar without moving its trigger or persisting hover", async () => {
    const root = getRoot();
    const app = track(
      new App(
        root,
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();
    click(root, 'button[aria-label="收起侧边栏"]');
    await waitForUi(() =>
      expect(root.querySelector('button[aria-label="展开侧边栏"]')).not.toBeNull()
    );
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]');
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.getAttribute("aria-controls")).toBe("gateway-sidebar-hover-drawer");

    pointer(trigger, "pointerover", "mouse");
    await waitForUi(() => expect(root.querySelector(".sidebar-drawer")).not.toBeNull());

    const drawer = root.querySelector<HTMLElement>(".sidebar-drawer");
    expect(root.querySelector('button[aria-label="展开侧边栏"]')).toBe(trigger);
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(drawer?.classList.contains("absolute")).toBe(true);
    expect(drawer?.classList.contains("z-40")).toBe(true);
    expect(drawer?.querySelector(".sidebar-drawer-header")?.textContent).toContain("demo");
    expect(drawer?.querySelector(".univer-logo")).toBeNull();
    expect(drawer?.querySelector(".sidebar-toggle")).toBeNull();
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");

    pointer(trigger, "pointerout", "mouse", drawer);
    pointer(drawer, "pointerover", "mouse", trigger);
    await delay(240);
    expect(root.querySelector(".sidebar-drawer")).not.toBeNull();

    pointer(drawer, "pointerout", "mouse", document.body);
    await waitForUi(() => expect(root.querySelector(".sidebar-drawer")).toBeNull());
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");
  });

  it("cancels delayed close on re-entry and closes the hover drawer with Escape", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    const root = getRoot();
    const app = track(
      new App(
        root,
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]');
    pointer(trigger, "pointerover", "mouse");
    await waitForUi(() => expect(root.querySelector(".sidebar-drawer")).not.toBeNull());
    const drawer = root.querySelector<HTMLElement>(".sidebar-drawer");

    pointer(trigger, "pointerout", "mouse", drawer);
    pointer(drawer, "pointerover", "mouse", trigger);
    pointer(drawer, "pointerout", "mouse", document.body);
    await delay(100);
    pointer(drawer, "pointerover", "mouse", document.body);
    await delay(140);
    expect(root.querySelector(".sidebar-drawer")).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await waitForUi(() => expect(root.querySelector(".sidebar-drawer")).toBeNull());
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");
  });

  it("keeps the hover drawer mounted while its portaled Language submenu is open", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    const root = getRoot();
    const app = track(
      new App(
        root,
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]');
    pointer(trigger, "pointerover", "mouse");
    await waitForUi(() => expect(root.querySelector(".sidebar-drawer")).not.toBeNull());
    const drawer = root.querySelector<HTMLElement>(".sidebar-drawer");
    pointer(trigger, "pointerout", "mouse", drawer);
    pointer(drawer, "pointerover", "mouse", trigger);

    click(root, ".sidebar-drawer .settings-row");
    await waitForUi(() => expect(document.querySelector(".settings-menu")).not.toBeNull());
    document.querySelector<HTMLElement>(".settings-submenu-trigger")?.click();
    await waitForUi(() => expect(document.querySelector(".settings-submenu")).not.toBeNull());
    pointer(drawer, "pointerout", "mouse", document.body);
    await delay(240);
    expect(root.querySelector(".sidebar-drawer")).not.toBeNull();

    const english = [
      ...document.querySelectorAll<HTMLElement>(".settings-submenu .settings-opt")
    ].find((option) => option.textContent?.includes("English"));
    english?.click();
    await waitForUi(() =>
      expect(root.querySelector('.discord-link[aria-label="Join the Discord community"]')).not.toBeNull()
    );
    await waitForUi(() => expect(root.querySelector(".sidebar-drawer")).toBeNull());
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");
  });

  it("ignores non-mouse hover while preserving click-to-expand", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    const root = getRoot();
    const app = track(
      new App(
        root,
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]');
    pointer(trigger, "pointerover", "touch");
    await delay(160);
    expect(root.querySelector(".sidebar-drawer")).toBeNull();

    trigger?.click();
    await waitForUi(() =>
      expect(root.querySelector(".sidebar:not(.sidebar-drawer)")).not.toBeNull()
    );
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("false");
  });

  it("uses same-origin file keys for gateway-owned viewer URLs", async () => {
    const root = getRoot();
    const key = "L3RtcC91bml2ZXItZ2F0ZXdheS1zbW9rZS9idWRnZXQudW5pdmVy";
    const app = track(
      App.sameOriginGateway(root, key, null, "unit_1", "trunk", null, "standalone")
    );

    await app.start();

    expect(mockState.descriptorEndpoints).toEqual([
      `${location.origin}/uf/${key}:univerfile.viewer`
    ]);
    expect(mockState.controlOptions[0]).toEqual({ origin: location.origin, gatewayFileKey: key });
    expect(mockState.viewerOptions[0]).toMatchObject({
      gatewayFileKey: key
    });
    expect(location.search).toContain(`file=${key}`);
  });

  it("coalesces an events-open refresh while the same viewer is mounting", async () => {
    mockState.deferViewer = true;
    const app = track(
      new App(
        getRoot(),
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();
    expect(mockState.viewerOptions).toHaveLength(1);

    mockState.univerfileOpen?.();
    await waitForUi(() => expect(mockState.viewerResolvers).toHaveLength(1));
    expect(mockState.viewerOptions).toHaveLength(1);

    mockState.viewerResolvers[0]?.();
  });

  it("rebuilds the active worktree viewer when ready changes its server permissions", async () => {
    const worktree: Worktree = {
      worktreeId: "wt_1",
      status: "draft",
      agentId: "agent",
      name: "Review",
      baseline: {},
      createdAt: "2026-08-07T00:00:00.000Z"
    };
    mockState.worktrees.push(worktree);
    const app = track(
      new App(
        getRoot(),
        location.origin,
        "/tmp/demo.univer",
        worktree.worktreeId,
        "unit_1",
        "worktree",
        null,
        "standalone"
      )
    );

    await app.start();
    await waitForUi(() => expect(mockState.viewerOptions).toHaveLength(1));

    mockState.univerfileWorktree?.({
      worktree: { ...worktree, status: "ready" }
    });

    await waitForUi(() => expect(mockState.viewerOptions).toHaveLength(2));
    expect(mockState.viewerOptions[1]).toMatchObject({
      worktreeId: worktree.worktreeId,
      unitId: "unit_1",
      editable: false
    });
  });

  it("applies a dark-mode choice made while the viewer is still mounting", async () => {
    mockState.deferViewer = true;
    const app = track(
      new App(
        getRoot(),
        location.origin,
        "/tmp/demo.univer",
        null,
        "unit_1",
        "trunk",
        null,
        "standalone"
      )
    );

    await app.start();
    expect(mockState.viewerOptions).toHaveLength(1);
    expect(mockState.viewerOptions[0]).toMatchObject({ darkMode: false });

    app.chooseAppearance("dark");
    expect(mockState.viewerOptions).toHaveLength(1);
    expect(mockState.viewerDarkModeCalls).toEqual([]);

    mockState.viewerResolvers[0]?.();
    await waitForUi(() => expect(mockState.viewerDarkModeCalls.at(-1)).toBe(true));
    expect(mockState.viewerOptions).toHaveLength(1);
  });
});

function getRoot(): HTMLElement {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Missing test root.");
  }
  return root;
}

function click(root: HTMLElement, selector: string): void {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`Missing button: ${selector}`);
  }
  button.click();
}

function pointer(
  element: Element | null | undefined,
  type: "pointerover" | "pointerout",
  pointerType: "mouse" | "touch",
  relatedTarget: EventTarget | null = null
): void {
  if (!element) {
    throw new Error(`Missing pointer target for ${type}.`);
  }
  const event = new MouseEvent(type, { bubbles: true, relatedTarget });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  element.dispatchEvent(event);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForUi(check: () => void): Promise<void> {
  await vi.waitFor(check, { timeout: 5_000 });
}
