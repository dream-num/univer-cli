import { act, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  measureWorktreeHeaderLayout,
  useWorktreeHeaderLayout
} from "../src/ui/worktree-header/layout";

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
function measure(header: HTMLElement): NonNullable<ReturnType<typeof measureWorktreeHeaderLayout>> {
  const host = document.createElement("div");
  host.inert = true;
  host.style.visibility = "hidden";
  document.body.append(host);
  try {
    return measureWorktreeHeaderLayout(header, host)!;
  } finally {
    host.remove();
  }
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
  it("returns layout without changing the visible Header and removes its measurement copy", () => {
    const header = fixture(1182);
    header.dataset.headerLayout = "flow";
    header.dataset.statusCompact = "true";
    header.style.setProperty("--header-available", "190px");
    header.querySelector('[data-header-segment="preview"]')!.setAttribute("data-stacked", "true");
    const before = header.outerHTML;
    const host = document.createElement("div");
    document.body.append(host);

    expect(measureWorktreeHeaderLayout(header, host)).toMatchObject({
      mode: "centered",
      previewStacked: false,
      statusCompact: false,
      available: 1150,
      nameNatural: 800
    });
    expect(header.outerHTML).toBe(before);
    expect(host.childNodes).toHaveLength(0);
  });

  it("removes the measurement copy even when a browser measurement fails", () => {
    const header = fixture(1182);
    const before = header.outerHTML;
    const host = document.createElement("div");
    document.body.append(host);
    vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(() => {
      throw new Error("Measurement failed");
    });
    expect(() => measureWorktreeHeaderLayout(header, host)).toThrow("Measurement failed");
    expect(header.outerHTML).toBe(before);
    expect(host.childNodes).toHaveLength(0);
  });

  it("uses symmetric space when available, and flow when only the sum fits", () => {
    const header = fixture(1182);
    expect(measure(header).mode).toBe("centered");
    setWidth(header, 1042);
    expect(measure(header).mode).toBe("flow");
    // Ordinary controls at the same width fit symmetrically; there is no shared breakpoint.
    setWidth(header.querySelector("[data-header-trailing]")!, 210);
    expect(measure(header).mode).toBe("centered");
  });

  it("re-measures intrinsic widths when widening from stacked preview controls", () => {
    const header = fixture(222);
    expect(measure(header)).toMatchObject({
      viewStacked: false,
      previewStacked: true
    });
    header.dataset.headerLayout = "flow";
    header.querySelector('[data-header-segment="preview"]')!.setAttribute("data-stacked", "true");
    setWidth(header, 1182);
    expect(measure(header)).toMatchObject({
      viewStacked: false,
      previewStacked: false
    });
    expect(measure(header).mode).toBe("centered");
    // Wider translations can require a vertical View/Compare control too.
    setWidth(header, 222);
    setWidth(header.querySelector('[data-header-segment="view"]')!, 250);
    expect(measure(header).viewStacked).toBe(true);
  });

  it("preserves version-change information as title space shrinks and restores full context", () => {
    const header = fixture(872);
    const title = header.querySelector("[data-header-title]")!;
    expect(measure(header).statusCompact).toBe(false);
    setWidth(title, 340);
    expect(measure(header)).toMatchObject({ statusCompact: true, statusRow: false });
    setWidth(title, 190);
    expect(measure(header).statusRow).toBe(true);
    setWidth(title, 420);
    expect(measure(header).statusCompact).toBe(false);
    expect(measure(header).statusRow).toBe(false);
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
      const { headerRef, measurementRef, layout } = useWorktreeHeaderLayout();
      return (
        <>
          <header
            ref={headerRef}
            data-header-layout={layout.mode}
            data-status-compact={layout.statusCompact}
            data-status-row={layout.statusRow}
            data-width="1182"
            style={{ padding: "6px 16px", columnGap: 12 }}
            dangerouslySetInnerHTML={{ __html: content() }}
          />
          <div ref={measurementRef} aria-hidden="true" inert />
        </>
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
