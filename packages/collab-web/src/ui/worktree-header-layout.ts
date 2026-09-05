import { useLayoutEffect, useRef, useState, type RefObject } from "react";

interface SegmentLayout {
  viewStacked: boolean;
  previewStacked: boolean;
}

interface WorktreeHeaderLayout extends SegmentLayout {
  headerRef: RefObject<HTMLElement | null>;
}

function textWidth(element: HTMLElement): number {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  // jsdom has no text layout. The browser always takes the Range measurement.
  return typeof range.getBoundingClientRect === "function"
    ? range.getBoundingClientRect().width
    : element.scrollWidth;
}

function px(style: CSSStyleDeclaration, property: string): number {
  return Number.parseFloat(style.getPropertyValue(property)) || 0;
}

/** Measure the actual rendered labels, including controls absent from the basic ready state. */
export function updateWorktreeHeaderLayout(header: HTMLElement): SegmentLayout {
  const title = header.querySelector<HTMLElement>("[data-header-title]");
  const name = header.querySelector<HTMLElement>("[data-header-name]");
  const leading = header.querySelector<HTMLElement>("[data-header-leading]");
  const view = header.querySelector<HTMLElement>('[data-header-segment="view"]');
  const preview = header.querySelector<HTMLElement>('[data-header-segment="preview"]');
  const trailing = header.querySelector<HTMLElement>("[data-header-trailing]");
  if (!title || !name || !leading || !view || !trailing) {
    return { viewStacked: false, previewStacked: false };
  }

  const style = getComputedStyle(header);
  const available = Math.max(
    0,
    header.clientWidth - px(style, "padding-left") - px(style, "padding-right")
  );
  const gap = px(style, "column-gap");
  const nameNatural = textWidth(name);
  header.style.setProperty("--header-name-natural", `${nameNatural}px`);
  header.style.setProperty("--header-available", `${available}px`);

  // A synchronous intrinsic pass is restored before paint. Do not measure a wrapped action
  // group or a stacked toggle: that would underestimate the width needed for a single row.
  header.dataset.headerLayout = "centered";
  view.dataset.stacked = "false";
  if (preview) preview.dataset.stacked = "false";
  const leadingWidth = leading.getBoundingClientRect().width;
  const titleMinimum = 260 + (header.querySelector(".sidebar-toggle-spacer") ? 42 : 0);
  header.style.setProperty("--header-title-min", `${titleMinimum}px`);
  const viewWidth = view.scrollWidth;
  const previewWidth = preview?.scrollWidth ?? 0;
  const trailingWidth = trailing.scrollWidth;
  const centeredMinimum = viewWidth + 2 * Math.max(titleMinimum, trailingWidth) + 2 * gap;
  header.dataset.headerLayout = available >= centeredMinimum ? "centered" : "flow";

  const viewStacked = viewWidth > available;
  const previewStacked = previewWidth > available;
  view.dataset.stacked = String(viewStacked);
  if (preview) preview.dataset.stacked = String(previewStacked);

  const titleWidth = title.getBoundingClientRect().width;
  const titleGap = px(getComputedStyle(title), "column-gap");
  const badge = title.querySelector<HTMLElement>('[data-slot="change-tag"]');
  const nameMinimum = Math.min(nameNatural, 100);
  const copyMinimum = nameMinimum + (badge ? badge.getBoundingClientRect().width + 6 : 0);
  const leadingMinimum = leadingWidth + titleGap + copyMinimum;
  const status = title.querySelector<HTMLElement>("[data-header-status]");
  const statusFull = title.querySelector<HTMLElement>("[data-header-status-full]");
  const statusShort = title.querySelector<HTMLElement>("[data-header-status-short]");
  header.dataset.statusCompact = "false";
  let statusMinimum = 0;
  if (status && statusFull) {
    const statusStyle = getComputedStyle(status);
    const statusIcon = status.querySelector("svg");
    const inset =
      px(statusStyle, "padding-left") +
      px(statusStyle, "padding-right") +
      (statusIcon ? statusIcon.getBoundingClientRect().width + px(statusStyle, "column-gap") : 0);
    statusMinimum = textWidth(statusFull) + inset;
    if (statusShort && leadingMinimum + titleGap + statusMinimum > titleWidth) {
      header.dataset.statusCompact = "true";
      statusMinimum = textWidth(statusShort) + inset;
    }
  }
  const statusRow = status !== null && leadingMinimum + titleGap + statusMinimum > titleWidth;
  header.dataset.statusRow = String(statusRow);
  header.style.setProperty(
    "--header-title-copy-width",
    `${Math.max(0, titleWidth - leadingWidth - titleGap)}px`
  );
  return { viewStacked, previewStacked };
}

/** Re-measure on rendered state/locale changes, available-width changes, and font loads. */
export function useWorktreeHeaderLayout(enabled: boolean): WorktreeHeaderLayout {
  const headerRef = useRef<HTMLElement>(null);
  const [segments, setSegments] = useState<SegmentLayout>({
    viewStacked: false,
    previewStacked: false
  });
  const measureRef = useRef((): void => {});
  measureRef.current = (): void => {
    if (!enabled || !headerRef.current) return;
    const next = updateWorktreeHeaderLayout(headerRef.current);
    setSegments((previous) =>
      previous.viewStacked === next.viewStacked && previous.previewStacked === next.previewStacked
        ? previous
        : next
    );
  };

  useLayoutEffect(() => {
    measureRef.current();
  });

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!enabled || !header) return;
    let frame: number | undefined;
    let width = header.getBoundingClientRect().width;
    let disposed = false;
    const schedule = (): void => {
      if (disposed || frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        measureRef.current();
      });
    };
    const observer = new ResizeObserver(() => {
      const nextWidth = header.getBoundingClientRect().width;
      if (nextWidth !== width) {
        width = nextWidth;
        schedule();
      }
    });
    observer.observe(header);
    const fonts = header.ownerDocument.fonts;
    void fonts?.ready.then(schedule);
    fonts?.addEventListener("loadingdone", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      fonts?.removeEventListener("loadingdone", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled]);

  return { headerRef, ...segments };
}
