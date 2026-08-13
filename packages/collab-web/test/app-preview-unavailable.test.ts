// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../src/i18n";
import { App } from "../src/ui/app";

/**
 * previewMerge business errors (HTTP 200 + error.code !== 1, e.g. a transform failure) carry no
 * `units` — the app must survive them: sidebar still renders (badges fall back to baseline diff)
 * and the topbar shows a friendly "合并预览不可用" notice instead of crashing the render.
 */
const PREVIEW_ERROR_ENVELOPE = {
  error: {
    code: 0,
    message:
      "[TransformService]: changesets revisions miss match. The 'baseRev' of c2 is 2 and the 'revision' of c1 is 2."
  }
};

vi.mock("@univer/collab-gateway-contract", () => {
  class MockWorktreeControlClient {
    public listUnits(
      worktreeId?: string
    ): Promise<Array<{ unitId: string; type: number; name: string; headRev: number }>> {
      if (worktreeId !== undefined) {
        return Promise.resolve([{ unitId: "unit_1", type: 2, name: "Demo Sheet", headRev: 3 }]);
      }
      return Promise.resolve([{ unitId: "unit_1", type: 2, name: "Demo Sheet", headRev: 2 }]);
    }

    public listWorktrees(): Promise<unknown[]> {
      return Promise.resolve([
        {
          worktreeId: "wt-1",
          status: "ready",
          agentId: "agent-1",
          name: "two-commits",
          createdAt: "2026-07-09 08:00:00",
          baseline: { unit_1: 1 }
        }
      ]);
    }

    public previewMerge(): Promise<unknown> {
      return Promise.resolve(PREVIEW_ERROR_ENVELOPE);
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
  openEventChannel: () => ({
    close: () => undefined
  })
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
  createViewer: () =>
    Promise.resolve({
      setDarkMode: () => undefined,
      setLocale: () => Promise.resolve(),
      dispose: () => undefined
    })
}));

function getRoot(): HTMLElement {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("missing root");
  }
  return root;
}

function startAppInWorktree(): App {
  const app = new App(
    getRoot(),
    location.origin,
    "/tmp/demo.univer",
    "wt-1",
    null,
    "worktree",
    null,
    "standalone"
  );
  apps.push(app);
  return app;
}

const apps: App[] = [];

describe("collab-web app: preview unavailable (business error envelope)", () => {
  beforeEach(async () => {
    await setLang("zh-CN");
    document.body.innerHTML = '<main id="root"></main>';
    history.replaceState(null, "", "/");
  });

  afterEach(async () => {
    // Unmount React roots while their portals are still attached; wiping body
    // first would orphan them and crash Base UI's portal cleanup.
    for (const app of apps.splice(0)) {
      app.dispose();
    }
    document.body.innerHTML = "";
    await setLang("en-US");
  });

  it("entering a worktree survives a previewMerge error envelope (no units field)", async () => {
    const app = startAppInWorktree();
    await expect(app.start()).resolves.toBeUndefined();

    // Sidebar still lists the worktree's units, badges fall back to the baseline diff.
    const unitRows = document.querySelectorAll(".worktree-units .row");
    expect(unitRows.length).toBeGreaterThan(0);
    expect(document.querySelector(".worktree-units")?.textContent).toContain("Demo Sheet");
  });

  it("shows a friendly notice in the topbar when the merge preview is unavailable", async () => {
    const app = startAppInWorktree();
    await app.start();

    expect(document.querySelector(".topbar")?.textContent).toContain("合并预览不可用");
  });
});
