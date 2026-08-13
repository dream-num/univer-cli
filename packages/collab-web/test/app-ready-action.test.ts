// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../src/i18n";
import { App } from "../src/ui/app";

const mockState = vi.hoisted(() => ({
  confirm: vi.fn(),
  ready: vi.fn(),
  worktreeName: "Draft changes",
  worktreeEvent: undefined as
    | ((event: {
        worktree: {
          worktreeId: string;
          status: "draft" | "ready";
          agentId: string;
          name: string;
          baseline: Record<string, number>;
          createdAt: string;
        };
      }) => void)
    | undefined
}));

vi.mock("@univer/collab-gateway-contract", () => {
  class MockWorktreeControlClient {
    public listUnits(
      worktreeId?: string
    ): Promise<Array<{ unitId: string; type: number; name: string; headRev: number }>> {
      return Promise.resolve(
        worktreeId === undefined
          ? [
              { unitId: "unit-unchanged", type: 2, name: "Unchanged Sheet", headRev: 2 },
              { unitId: "unit-modified", type: 2, name: "Modified Sheet", headRev: 2 },
              { unitId: "unit-deleted", type: 2, name: "Deleted Sheet", headRev: 2 }
            ]
          : [
              { unitId: "unit-unchanged", type: 2, name: "Unchanged Sheet", headRev: 2 },
              { unitId: "unit-modified", type: 2, name: "Modified Sheet", headRev: 3 },
              { unitId: "unit-added", type: 2, name: "Added Sheet", headRev: 1 }
            ]
      );
    }

    public listWorktrees(): Promise<unknown[]> {
      return Promise.resolve([
        {
          worktreeId: "wt-1",
          status: "draft",
          agentId: "agent-1",
          name: mockState.worktreeName,
          baseline: { "unit-unchanged": 2, "unit-modified": 2, "unit-deleted": 2 },
          createdAt: "2026-08-09T09:00:00.000Z"
        }
      ]);
    }

    public previewMerge(): Promise<unknown> {
      return Promise.resolve({
        error: { code: 1, message: "" },
        diverged: true,
        mergeable: true,
        conflicts: [],
        units: []
      });
    }

    public ready(worktreeId: string): Promise<unknown> {
      return mockState.ready(worktreeId);
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
    fetchGatewayDescriptor: () => Promise.resolve({}),
    WorktreeControlClient: MockWorktreeControlClient
  };
});

vi.mock("../src/core/events", () => ({
  openEventChannel: (
    url: string,
    handlers: {
      worktree?: typeof mockState.worktreeEvent;
    }
  ) => {
    if (!url.includes("/worktrees/")) {
      mockState.worktreeEvent = handlers.worktree;
    }
    return { close: () => undefined };
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
  createViewer: () =>
    Promise.resolve({
      setDarkMode: () => undefined,
      setLocale: () => Promise.resolve(),
      dispose: () => undefined
    })
}));

vi.mock("../src/ui/dialogs", () => ({
  confirmDialog: (options: unknown) => mockState.confirm(options),
  conflictDialog: () => Promise.resolve(),
  escapeHtml: (value: string) =>
    value.replace(
      /[&<>"]/g,
      (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]
    )
}));

describe("collab-web ready action", () => {
  let app: App | undefined;

  beforeEach(async () => {
    await setLang("en-US");
    document.body.innerHTML = '<main id="root"></main>';
    history.replaceState(null, "", "/");
    mockState.confirm.mockReset().mockResolvedValue(true);
    mockState.worktreeName = "Draft changes";
    mockState.worktreeEvent = undefined;
    mockState.ready.mockReset().mockResolvedValue({
      error: { code: 1, message: "" },
      ok: true,
      status: "ready",
      worktree: {
        worktreeId: "wt-1",
        status: "ready",
        agentId: "agent-1",
        name: "Draft changes",
        baseline: { "unit-unchanged": 2, "unit-modified": 2, "unit-deleted": 2 },
        createdAt: "2026-08-09T09:00:00.000Z"
      }
    });
  });

  afterEach(() => {
    app?.dispose();
    app = undefined;
    document.body.innerHTML = "";
  });

  it("submits the draft and exposes merge from the authoritative response", async () => {
    await startApp();

    button("Submit for confirmation").click();

    await vi.waitFor(() => expect(mockState.ready).toHaveBeenCalledWith("wt-1"));
    expect(mockState.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Submit this modification for confirmation?",
        body: expect.stringContaining("Draft changes"),
        chips: [
          { id: "unit:unit-modified", label: "Modified Sheet" },
          { id: "unit:unit-added", label: "Added Sheet" },
          { id: "deleted:unit-deleted", label: "Deleted Sheet" }
        ]
      })
    );
    await vi.waitFor(() => expect(app?.getSnapshot().worktrees[0]?.status).toBe("ready"));
    expect(findButton("Submit for confirmation")).toBeUndefined();
    expect(findButton("Merge into current version")).toBeDefined();
  });

  it("keeps the worktree draft when the gateway rejects ready", async () => {
    mockState.ready.mockResolvedValue({
      error: { code: 0, message: "Worktree is no longer writable" },
      ok: false
    });
    await startApp();

    button("Submit for confirmation").click();

    await vi.waitFor(() =>
      expect(document.getElementById("toast")?.textContent).toContain(
        "Worktree is no longer writable"
      )
    );
    expect(app?.getSnapshot().worktrees[0]?.status).toBe("draft");
    expect(app?.getSnapshot().busy).toBe(false);
    expect(findButton("Submit for confirmation")).toBeDefined();
    expect(findButton("Merge into current version")).toBeUndefined();
  });

  it("does not let an older ready response overwrite a newer lifecycle event", async () => {
    let resolveReady: ((response: unknown) => void) | undefined;
    mockState.ready.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReady = resolve;
        })
    );
    await startApp();

    button("Submit for confirmation").click();
    await vi.waitFor(() => expect(mockState.ready).toHaveBeenCalledOnce());

    mockState.worktreeEvent?.({
      worktree: {
        worktreeId: "wt-1",
        status: "draft",
        agentId: "agent-1",
        name: "Draft changes",
        baseline: { "unit-unchanged": 2, "unit-modified": 2, "unit-deleted": 2 },
        createdAt: "2026-08-09T09:00:00.000Z"
      }
    });
    resolveReady?.({
      error: { code: 1, message: "" },
      ok: true,
      status: "ready",
      worktree: {
        worktreeId: "wt-1",
        status: "ready",
        agentId: "agent-1",
        name: "Draft changes",
        baseline: { "unit-unchanged": 2, "unit-modified": 2, "unit-deleted": 2 },
        createdAt: "2026-08-09T09:00:00.000Z"
      }
    });

    await vi.waitFor(() => expect(app?.getSnapshot().busy).toBe(false));
    expect(app?.getSnapshot().worktrees[0]).toMatchObject({ status: "draft" });
    expect(findButton("Submit for confirmation")).toBeDefined();
    expect(findButton("Merge into current version")).toBeUndefined();
  });

  it("escapes an untrusted worktree name before inserting it into trusted modal HTML", async () => {
    mockState.worktreeName = '<img src=x onerror="alert(1)">';
    await startApp();

    button("Submit for confirmation").click();

    await vi.waitFor(() => expect(mockState.confirm).toHaveBeenCalledOnce());
    const options = mockState.confirm.mock.calls[0]?.[0] as { body: string };
    expect(options.body).not.toContain("<img");
    expect(options.body).toContain("&lt;img");
    expect(options.body).toContain("&quot;alert(1)&quot;");
  });

  async function startApp(): Promise<void> {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("Missing test root");
    }
    app = new App(
      root,
      location.origin,
      "/tmp/demo.univer",
      "wt-1",
      "unit-modified",
      "worktree",
      null,
      "standalone"
    );
    await app.start();
  }
});

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label
  );
}

function button(label: string): HTMLButtonElement {
  const candidate = findButton(label);
  if (candidate === undefined) {
    throw new Error(`Missing button: ${label}`);
  }
  return candidate;
}
