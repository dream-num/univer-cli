import { act, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateWorktreeHeaderLayout,
  useWorktreeHeaderLayout
} from "../src/ui/worktree-header-layout";

// Supply browser measurements; actual Flex/Grid geometry is covered by the browser fixture.
function setWidth(element: Element, width: number): void {
  element.setAttribute("data-width", String(width));
}
function measuredWidth(element: Element): number {
  return Number(element.getAttribute("data-width") ?? 0);
}

let root: Root | undefined;
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return {
      width: measuredWidth(this),
      height: 32,
      left: 0,
      right: measuredWidth(this),
      top: 0,
      bottom: 32,
      x: 0,
      y: 0,
      toJSON: () => ({})
    };
  });
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
    return measuredWidth(this);
  });
  vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (this: Element) {
    // A compact measurement is deliberately misleading until the intrinsic pass resets it.
    return this.getAttribute("data-stacked") === "true" ? 100 : measuredWidth(this);
  });
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  root?.unmount();
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function content(): string {
  return `<div data-header-title data-width="420" style="gap:10px">
    <span data-header-leading data-width="28"></span>
    <span data-header-title-copy><span data-header-name data-width="800">Long name</span><span data-slot="change-tag" data-width="23">New</span></span>
    <span data-header-status style="padding:4px 8px"><span data-header-status-full data-width="220">Latest changed · showing merge</span><span data-header-status-short data-width="130">Latest changed</span></span>
  </div>
  <div data-header-segment="view" data-width="174"></div>
  <div data-header-trailing data-width="458"><div data-header-segment="preview" data-width="236"></div></div>`;
}
function fixture(width: number): HTMLElement {
  const header = document.createElement("header");
  header.style.cssText = "padding:6px 16px;column-gap:12px";
  header.innerHTML = content();
  setWidth(header, width);
  document.body.append(header);
  return header;
}

describe("content-driven Worktree Header", () => {
  it("uses symmetric space when available, and flow when only the sum fits", () => {
    const header = fixture(1182);
    updateWorktreeHeaderLayout(header);
    expect(header.dataset.headerLayout).toBe("centered");
    setWidth(header, 1042);
    updateWorktreeHeaderLayout(header);
    expect(header.dataset.headerLayout).toBe("flow");
    // Ordinary controls at the same width fit symmetrically; there is no shared breakpoint.
    setWidth(header.querySelector("[data-header-trailing]")!, 210);
    updateWorktreeHeaderLayout(header);
    expect(header.dataset.headerLayout).toBe("centered");
  });

  it("re-measures intrinsic widths when widening from stacked preview controls", () => {
    const header = fixture(222);
    expect(updateWorktreeHeaderLayout(header)).toEqual({
      viewStacked: false,
      previewStacked: true
    });
    setWidth(header, 1182);
    expect(updateWorktreeHeaderLayout(header)).toEqual({
      viewStacked: false,
      previewStacked: false
    });
    expect(header.dataset.headerLayout).toBe("centered");
    // Wider translations can require a vertical View/Compare control too.
    setWidth(header, 222);
    setWidth(header.querySelector('[data-header-segment="view"]')!, 250);
    expect(updateWorktreeHeaderLayout(header).viewStacked).toBe(true);
  });

  it("preserves version-change information as title space shrinks and restores full context", () => {
    const header = fixture(872);
    const title = header.querySelector("[data-header-title]")!;
    updateWorktreeHeaderLayout(header);
    expect(header.dataset.statusCompact).toBe("false");
    setWidth(title, 340);
    updateWorktreeHeaderLayout(header);
    expect(header.dataset.statusCompact).toBe("true");
    expect(header.dataset.statusRow).toBe("false");
    setWidth(title, 190);
    updateWorktreeHeaderLayout(header);
    expect(header.dataset.statusRow).toBe("true");
    setWidth(title, 420);
    updateWorktreeHeaderLayout(header);
    expect(header.dataset.statusCompact).toBe("false");
    expect(header.dataset.statusRow).toBe("false");
  });

  it("responds to container resize without an App render and cleans up pending work", async () => {
    let resized: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resized = callback;
        }
        observe(): void {}
        disconnect(): void {
          disconnect();
        }
      }
    );
    let scheduled: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduled = callback;
      return 7;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    function Probe(): ReactElement {
      const { headerRef } = useWorktreeHeaderLayout(true);
      return (
        <header
          ref={headerRef}
          data-width="1182"
          style={{ padding: "6px 16px", columnGap: 12 }}
          dangerouslySetInnerHTML={{ __html: content() }}
        />
      );
    }
    root = createRoot(document.getElementById("root")!);
    flushSync(() => root?.render(<Probe />));
    const header = document.querySelector("header")!;
    expect(header.dataset.headerLayout).toBe("centered");
    setWidth(header, 702);
    resized?.([], {} as ResizeObserver);
    expect(scheduled).toBeDefined();
    await act(async () => scheduled?.(0));
    expect(header.dataset.headerLayout).toBe("flow");
    setWidth(header, 222);
    resized?.([], {} as ResizeObserver);
    root.unmount();
    root = undefined;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});
