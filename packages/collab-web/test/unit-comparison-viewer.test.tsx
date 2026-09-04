// @vitest-environment jsdom
import {
  UNIT_TYPE_DOC,
  type UnitComparisonContext,
} from "@univer/collab-gateway-contract";
import { LocaleType, type IDocumentData, type Univer } from "@univerjs/core";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UnitComparisonViewer,
  type UnitComparisonUniverFactory,
  type UnitComparisonViewerValue,
} from "../src/comparison/unit-comparison-viewer";
import { setLang } from "../src/i18n";

const paneState = vi.hoisted(() => ({
  createCalls: [] as Array<Record<string, unknown>>,
  handles: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    focusComparisonTarget: ReturnType<typeof vi.fn>;
    setComparisonSelection: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("../src/comparison/native/comparison-pane", () => ({
  createComparisonPane: vi.fn(async (options: Record<string, unknown>) => {
    paneState.createCalls.push(options);
    const runtime = await (options.createUniver as UnitComparisonUniverFactory)({
      container: options.container as HTMLElement,
      unitType: options.unitType as typeof UNIT_TYPE_DOC,
      locale: LocaleType.EN_US,
      darkMode: false,
    });
    const handle = {
      dispose: vi.fn(() => runtime.dispose()),
      focusComparisonTarget: vi.fn(async () => true),
      getBoardViewport: vi.fn(() => null),
      setBoardViewport: vi.fn(),
      setComparisonSelection: vi.fn(async () => undefined),
      subscribeBoardViewport: vi.fn(() => () => undefined),
    };
    paneState.handles.push(handle);
    return handle;
  }),
}));

describe("UnitComparisonViewer lifecycle boundary", () => {
  let root: Root;
  let host: HTMLElement;

  beforeEach(async () => {
    await setLang("en-US");
    document.body.innerHTML = '<main id="root"></main>';
    host = document.getElementById("root")!;
    root = createRoot(host);
    paneState.createCalls = [];
    paneState.handles = [];
  });

  afterEach(async () => {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.body.innerHTML = "";
  });

  it("creates one runtime per present side and does not remount on selection", async () => {
    const runtimes: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
    const createUniver = vi.fn(async () => {
      const runtime = { univer: {} as Univer, dispose: vi.fn() };
      runtimes.push(runtime);
      return runtime;
    });
    const comparison = docComparison("cmp-1");

    flushSync(() => root.render(renderViewer("cmp-1", comparison, createUniver)));
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(
        paneState.handles.every((handle) => handle.focusComparisonTarget.mock.calls.length > 0),
      ).toBe(true),
    );

    const item = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Paragraph"),
    );
    expect(item).toBeDefined();
    flushSync(() => item?.click());
    await vi.waitFor(() =>
      expect(paneState.handles.every((handle) => handle.setComparisonSelection.mock.calls.length > 0))
        .toBe(true),
    );
    expect(createUniver).toHaveBeenCalledTimes(2);

    flushSync(() =>
      root.render(renderViewer("cmp-2", docComparison("cmp-2"), createUniver)),
    );
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(runtimes.slice(0, 2).every((runtime) => runtime.dispose.mock.calls.length === 1)).toBe(true));
  });

  it("does not call the factory for a missing side", async () => {
    const createUniver = vi.fn(async () => ({ univer: {} as Univer, dispose: vi.fn() }));
    const comparison = docComparison("cmp-missing", true);
    flushSync(() => root.render(renderViewer("cmp-missing", comparison, createUniver)));
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(1));
    expect(host.textContent).toContain("Not present");
  });
});

function renderViewer(
  key: string,
  comparison: UnitComparisonViewerValue,
  createUniver: UnitComparisonUniverFactory,
) {
  return (
    <UnitComparisonViewer
      key={key}
      comparison={comparison}
      createUniver={createUniver}
      locale={LocaleType.EN_US}
      darkMode={false}
    />
  );
}

function docComparison(comparisonId: string, missingLeft = false): UnitComparisonViewerValue {
  const unitData = { id: "doc-1" } as IDocumentData;
  const result = {
    schemaVersion: 1,
    comparisonId,
    unit: { unitId: "doc-1", type: UNIT_TYPE_DOC, name: "Document", presence: "paired" },
    fidelity: "history",
    stale: false,
    detail: "full",
    summary: { total: 1, insert: 0, delete: 0, update: 1, moved: 0, byEntityType: {} },
    coverage: { supportedEntityTypes: ["paragraph"] },
    scopes: [],
    page: { offset: 0, limit: 100, matched: 1, hasMore: false },
    items: [
      {
        id: "paragraph:p1",
        stableId: "p1",
        kind: "update",
        entityType: "paragraph",
        path: ["body", "paragraphs", "p1"],
        title: "Paragraph",
        moved: false,
        changes: [],
        details: [],
        locations: { left: null, right: null },
      },
    ],
    diagnostics: { readiness: "ready", unsupportedMutationIds: [], codes: [] },
    productContext: {
      kind: "doc",
      paragraphAlignment: {
        total: 0,
        page: { offset: 0, limit: 100, matched: 0, hasMore: false },
        rows: [],
      },
    },
  } as UnitComparisonContext;
  return {
    result,
    left: { label: "Before", unitData: missingLeft ? null : unitData },
    right: { label: "After", revision: 2, unitData },
  };
}
