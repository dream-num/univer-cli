import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnUsMessages } from "../src/i18n/locales/en-US";
import { useHeaderLayout } from "../src/ui/worktree-header/layout";
import type { WorktreeHeaderModel } from "../src/ui/worktree-header/model";

const messages = createEnUsMessages().topbar;
const model: WorktreeHeaderModel = {
  title: "Header",
  unitType: 2,
  viewMode: "view",
  canDiscard: true,
  canRefreshComparison: false,
  reserveSidebarToggle: false
};

// jsdom cannot lay out CSS. These tests exercise resize/lifecycle behavior only;
// the real-component browser fixture verifies geometry, row order, and clipping.
describe("Header layout lifecycle", () => {
  let root: Root;
  let width: number;
  let trailingWidth: number;
  let titleRowWidth: number;
  let nameWidth: number;
  let renders: number;
  let observers: { notify: () => void; disconnect: ReturnType<typeof vi.fn> }[];

  function Harness({ value = model }: { value?: WorktreeHeaderModel }): ReactElement {
    renders++;
    const { headerRef, layout, titleMinimum } = useHeaderLayout(value, messages);
    return (
      <header
        ref={headerRef}
        data-layout={layout}
        data-title-minimum={titleMinimum}
        style={{ padding: "6px 16px", columnGap: 12 }}
      >
        <div data-header-title-row>
          <span data-header-name style={{ flexBasis: 100 }} />
        </div>
        <div data-header-segment="view" />
        <div data-header-trailing />
      </header>
    );
  }

  beforeEach(() => {
    width = 1182;
    trailingWidth = 452;
    titleRowWidth = 260;
    nameWidth = 100;
    renders = 0;
    observers = [];
    document.body.innerHTML = '<main id="root"></main>';
    root = createRoot(document.getElementById("root")!);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => trailingWidth);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const width = this.hasAttribute("data-header-title-row")
          ? titleRowWidth
          : this.hasAttribute("data-header-name")
            ? nameWidth
            : 174;
        return { width } as DOMRect;
      }
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect = vi.fn();
        constructor(callback: () => void) {
          observers.push({ notify: callback, disconnect: this.disconnect });
        }
        observe(): void {}
      }
    );
  });

  afterEach(() => {
    root.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("recovers centering after shrinking and ignores height-only resize notifications", () => {
    flushSync(() => root.render(<Harness />));
    const header = document.querySelector("header")!;
    expect(header.dataset.layout).toBe("centered");
    const settledRenders = renders;
    flushSync(() => observers[0]!.notify());
    expect(renders).toBe(settledRenders);
    width = 702;
    flushSync(() => observers[0]!.notify());
    expect(header.dataset.layout).toBe("flow");
    width = 1182;
    flushSync(() => observers[0]!.notify());
    expect(header.dataset.layout).toBe("centered");
  });

  it("keeps short and truncated long titles centered when their actual contents fit", () => {
    width = 674;
    trailingWidth = 204;
    titleRowWidth = 130;
    nameWidth = 54;
    flushSync(() => root.render(<Harness value={{ ...model, title: "diff-doc" }} />));
    const header = document.querySelector("header")!;
    expect(header.dataset.layout).toBe("centered");
    expect(header.dataset.titleMinimum).toBe("130");

    // Longer names may shrink to 100px, while icon, badge and internal gaps remain intact.
    titleRowWidth = 356;
    nameWidth = 280;
    flushSync(() => root.render(<Harness value={{ ...model, title: "Budget".repeat(100) }} />));
    expect(header.dataset.layout).toBe("centered");
    expect(header.dataset.titleMinimum).toBe("176");
  });

  it("remeasures changed controls and disconnects observers on replacement and unmount", () => {
    flushSync(() => root.render(<Harness />));
    trailingWidth = 600;
    flushSync(() => root.render(<Harness value={{ ...model, previewSource: "preview" }} />));
    expect(document.querySelector("header")!.dataset.layout).toBe("flow");
    expect(observers[0]!.disconnect).toHaveBeenCalledOnce();
    flushSync(() => root.render(null));
    expect(observers[1]!.disconnect).toHaveBeenCalledOnce();
  });
});
