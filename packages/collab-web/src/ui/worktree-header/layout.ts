import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Messages } from "../../i18n/locales/en-US";
import type { WorktreeHeaderModel } from "./model";

type HeaderLayout = "measuring" | "centered" | "flow";

/** Only choose symmetric columns or a flat flex flow; CSS handles every row and text wrap. */
export function useHeaderLayout(
  model: WorktreeHeaderModel,
  messages: Messages["topbar"]
): { headerRef: RefObject<HTMLElement | null>; layout: HeaderLayout; titleMinimum: number } {
  const headerRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<HeaderLayout>("measuring");
  const [titleMinimum, setTitleMinimum] = useState(0);

  useLayoutEffect(() => {
    const header = headerRef.current!;
    let width = header.clientWidth;
    let active = true;
    setLayout("measuring");
    const observer = new ResizeObserver(() => {
      const nextWidth = header.clientWidth;
      // Row-height changes caused by this layout must not trigger another measurement.
      if (nextWidth !== width) {
        width = nextWidth;
        setLayout("measuring");
      }
    });
    observer.observe(header);
    void header.ownerDocument.fonts?.ready.then(() => {
      if (active) setLayout("measuring");
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [model, messages]);

  useLayoutEffect(() => {
    if (layout !== "measuring") return;
    const header = headerRef.current!;
    const style = getComputedStyle(header);
    const view = header.querySelector<HTMLElement>('[data-header-segment="view"]')!;
    const trailing = header.querySelector<HTMLElement>("[data-header-trailing]")!;
    const titleRow = header.querySelector<HTMLElement>("[data-header-title-row]")!;
    const name = header.querySelector<HTMLElement>("[data-header-name]")!;
    const nameWidth = name.getBoundingClientRect().width;
    // Measure the uncompressed row; only the filename may shrink to its CSS flex basis.
    const minimum = Math.ceil(
      titleRow.getBoundingClientRect().width -
        nameWidth +
        Math.min(nameWidth, parseFloat(getComputedStyle(name).flexBasis))
    );
    setTitleMinimum(minimum);
    const available =
      header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const required =
      view.getBoundingClientRect().width +
      2 * Math.max(minimum, trailing.scrollWidth) +
      2 * parseFloat(style.columnGap);
    // React renders the measuring state and settles the final layout before paint.
    setLayout(available >= required ? "centered" : "flow");
  }, [layout]);

  return { headerRef, layout, titleMinimum };
}
