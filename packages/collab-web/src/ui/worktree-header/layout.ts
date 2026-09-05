import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

interface HeaderLayout {
  mode: "centered" | "flow";
  viewStacked: boolean;
  previewStacked: boolean;
  statusCompact: boolean;
  statusRow: boolean;
  nameNatural: number;
  available: number;
  titleMinimum: number;
  titleCopyWidth: number;
}

interface WorktreeHeaderLayout {
  headerRef: RefObject<HTMLElement | null>;
  measurementRef: RefObject<HTMLDivElement | null>;
  layout: HeaderLayout;
}

const initialLayout: HeaderLayout = {
  mode: "flow",
  viewStacked: false,
  previewStacked: false,
  statusCompact: false,
  statusRow: false,
  nameNatural: 100,
  available: 0,
  titleMinimum: 260,
  titleCopyWidth: 0
};

function sameLayout(previous: HeaderLayout, next: HeaderLayout): boolean {
  return (Object.keys(next) as (keyof HeaderLayout)[]).every((key) => previous[key] === next[key]);
}

/** Only the empty, inert measurement host is mutated; React owns the visible Header. */
export function measureWorktreeHeaderLayout(
  header: HTMLElement,
  measurementHost: HTMLElement
): HeaderLayout | null {
  const copy = header.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  for (const element of copy.querySelectorAll("[id]")) element.removeAttribute("id");
  copy.style.width = `${header.getBoundingClientRect().width}px`;
  measurementHost.append(copy);
  try {
    return measureHeaderCopy(copy);
  } finally {
    copy.remove();
  }
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

/** Temporary layout changes are confined to the disposable measurement copy. */
function measureHeaderCopy(header: HTMLElement): HeaderLayout | null {
  const title = header.querySelector<HTMLElement>("[data-header-title]");
  const name = header.querySelector<HTMLElement>("[data-header-name]");
  const leading = header.querySelector<HTMLElement>("[data-header-leading]");
  const view = header.querySelector<HTMLElement>('[data-header-segment="view"]');
  const preview = header.querySelector<HTMLElement>('[data-header-segment="preview"]');
  const trailing = header.querySelector<HTMLElement>("[data-header-trailing]");
  if (!title || !name || !leading || !view || !trailing) {
    return null;
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

  // Start from intrinsic control widths so a wrapped or stacked layout cannot make itself
  // appear to fit when the available width changes.
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
  const mode = available >= centeredMinimum ? "centered" : "flow";
  header.dataset.headerLayout = mode;

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
  let statusCompact = false;
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
      statusCompact = true;
      header.dataset.statusCompact = "true";
      statusMinimum = textWidth(statusShort) + inset;
    }
  }
  const statusRow = status !== null && leadingMinimum + titleGap + statusMinimum > titleWidth;
  return {
    mode,
    viewStacked,
    previewStacked,
    statusCompact,
    statusRow,
    nameNatural,
    available,
    titleMinimum,
    titleCopyWidth: Math.max(0, titleWidth - leadingWidth - titleGap)
  };
}

/** Re-measure on rendered state/locale changes, available-width changes, and font loads. */
export function useWorktreeHeaderLayout(): WorktreeHeaderLayout {
  const headerRef = useRef<HTMLElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<HeaderLayout>(initialLayout);

  const measure = useCallback((): void => {
    if (!headerRef.current || !measurementRef.current) return;
    const next = measureWorktreeHeaderLayout(headerRef.current, measurementRef.current);
    if (next) setLayout((previous) => (sameLayout(previous, next) ? previous : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  });

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame: number | undefined;
    let width = header.getBoundingClientRect().width;
    let disposed = false;
    const schedule = (): void => {
      if (disposed || frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        measure();
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
  }, [measure]);

  return { headerRef, measurementRef, layout };
}
