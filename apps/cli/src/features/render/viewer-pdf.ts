import { resolveUniverRenderBrowser } from "@univer-cli/univer-render-runtime";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const PAGE_READY_TIMEOUT_MS = 60_000;
const PRINT_READY_ATTRIBUTE = "data-univer-cli-print-ready";
const PRINT_FRAME_ATTRIBUTE = "data-univer-cli-print-frame";

// Only one print plugin is registered for the active Viewer. Discover that browser capability
// instead of choosing a renderer from the Unit type in the CLI.
const VIEWER_PRINT_FLOWS = [
  { open: "docs.operation.print" },
  { open: "sheet.operation.print-open", confirm: "sheet.operation.confirm-print" },
  { open: "slide.operation.print-open", confirm: "slide.operation.print" },
  { open: "boards-print.operation.print" },
] as const;

export interface ViewerPdfPrintResult {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
}

export interface ViewerPdfPrinter {
  print(input: { readonly url: string }): Promise<ViewerPdfPrintResult>;
}

export function createViewerPdfPrinter(input: {
  readonly env: NodeJS.ProcessEnv;
}): ViewerPdfPrinter {
  return {
    async print({ url }) {
      const resolution = await resolveUniverRenderBrowser({ env: input.env });
      if (resolution.status === "missing") {
        throw codedError(
          "BROWSER_UNAVAILABLE",
          `no Chrome/Chromium executable found; set ${resolution.envVar} or install a browser`,
        );
      }

      let browser: Browser | undefined;
      try {
        browser = await puppeteer.launch({
          executablePath: resolution.executablePath,
          headless: true,
          args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
        });
        const viewerPage = await browser.newPage();
        viewerPage.setDefaultTimeout(PAGE_READY_TIMEOUT_MS);
        await viewerPage.setViewport({ height: 1000, width: 1600, deviceScaleFactor: 1 });
        await viewerPage.goto(url, { timeout: PAGE_READY_TIMEOUT_MS, waitUntil: "load" });
        await viewerPage.waitForFunction("window.univerAPI !== undefined", {
          timeout: PAGE_READY_TIMEOUT_MS,
        });
        await viewerPage.waitForNetworkIdle({
          idleTime: 500,
          timeout: PAGE_READY_TIMEOUT_MS,
        });
        await viewerPage.evaluate(
          "document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))",
        );

        await installPrintCapture(viewerPage);
        const confirmCommand = await openViewerPrintFlow(viewerPage);
        if (confirmCommand !== undefined) {
          await confirmViewerPrintFlow(viewerPage, confirmCommand);
        }
        await viewerPage.waitForSelector(`html[${PRINT_READY_ATTRIBUTE}]`, {
          timeout: PAGE_READY_TIMEOUT_MS,
        });
        await viewerPage.evaluate(
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        );

        const bytes = await printCapturedDocument(browser, viewerPage);
        return { bytes, pageCount: readPdfPageCount(bytes) };
      } catch (error) {
        if (errorCode(error) === "BROWSER_UNAVAILABLE") throw error;
        throw codedError(
          "RENDER_FAILED",
          `Viewer PDF printing failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        await browser?.close().catch(() => undefined);
      }
    },
  };
}

async function installPrintCapture(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const readyAttribute = ${JSON.stringify(PRINT_READY_ATTRIBUTE)};
    const frameAttribute = ${JSON.stringify(PRINT_FRAME_ATTRIBUTE)};
    const install = (target, frame) => {
      if (target === null || target === undefined) return;
      const capture = () => {
        target.dispatchEvent(new target.Event("beforeprint"));
        if (frame !== undefined) frame.setAttribute(frameAttribute, "");
        window.top.document.documentElement.setAttribute(readyAttribute, "");
      };
      try {
        Object.defineProperty(target, "print", { configurable: true, value: capture, writable: true });
      } catch {
        target.print = capture;
      }
    };
    const installFrames = () => {
      for (const frame of document.querySelectorAll("iframe")) {
        try { install(frame.contentWindow, frame); } catch {}
      }
    };
    install(window);
    installFrames();
    new MutationObserver(installFrames).observe(document.documentElement, { childList: true, subtree: true });
  })()`);
}

async function openViewerPrintFlow(page: Page): Promise<string | undefined> {
  const flow = (await page.evaluate(
    `(async () => {
      const flows = ${JSON.stringify(VIEWER_PRINT_FLOWS)};
      const api = window.univerAPI;
      if (api === undefined) throw new Error("Viewer API is unavailable");
      for (const flow of flows) {
        const outcome = await Promise.race([
          api.executeCommand(flow.open).then(
            (value) => ({ status: "accepted", value }),
            (error) => ({ status: "rejected", message: error instanceof Error ? error.message : String(error) }),
          ),
          new Promise((resolve) => setTimeout(() => resolve({ status: "pending" }), 100)),
        ]);
        if (outcome.status === "pending") return flow;
        if (outcome.status === "accepted") {
          if (outcome.value === false) throw new Error("Viewer rejected the print request");
          return flow;
        }
        if (!/not (?:registered|found)|does not exist|unknown command/i.test(outcome.message)) {
          throw new Error(outcome.message);
        }
      }
      throw new Error("Viewer has no registered print capability");
    })()`,
  )) as (typeof VIEWER_PRINT_FLOWS)[number];
  return "confirm" in flow ? flow.confirm : undefined;
}

async function confirmViewerPrintFlow(page: Page, command: string): Promise<void> {
  const deadline = Date.now() + PAGE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await page.evaluate(
      `(() => {
        const command = ${JSON.stringify(command)};
        const result = window.univerAPI?.executeCommand(command);
        result?.catch((error) => {
          window.document.documentElement.setAttribute(
            "data-univer-cli-print-error",
            error instanceof Error ? error.message : String(error),
          );
        });
      })()`,
    );
    const state = (await page.evaluate(`(() => ({
      printed: document.documentElement.hasAttribute(${JSON.stringify(PRINT_READY_ATTRIBUTE)}),
      error: document.documentElement.getAttribute("data-univer-cli-print-error"),
    }))()`)) as { readonly error: string | null; readonly printed: boolean };
    if (state.error !== null) throw new Error(state.error);
    if (state.printed) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Viewer print preparation timed out");
}

async function serializePrintDocument(page: Page): Promise<string> {
  return (await page.evaluate(`(() => {
    const frame = document.querySelector(${JSON.stringify(`iframe[${PRINT_FRAME_ATTRIBUTE}]`)});
    const source = frame?.contentDocument ?? document;
    const clone = source.documentElement.cloneNode(true);
    const originals = Array.from(source.querySelectorAll("canvas"));
    const copies = Array.from(clone.querySelectorAll("canvas"));
    for (let index = 0; index < originals.length; index += 1) {
      const original = originals[index];
      const copy = copies[index];
      if (copy === undefined) continue;
      const image = source.createElement("img");
      for (const attribute of copy.attributes) image.setAttribute(attribute.name, attribute.value);
      image.setAttribute("src", original.toDataURL("image/png"));
      copy.replaceWith(image);
    }
    for (const script of clone.querySelectorAll("script")) script.remove();
    const head = clone.querySelector("head");
    if (head !== null) {
      const base = source.createElement("base");
      base.href = source.baseURI;
      head.prepend(base);
    }
    return "<!doctype html>" + clone.outerHTML;
  })()`)) as string;
}

async function printCapturedDocument(browser: Browser, viewerPage: Page): Promise<Uint8Array> {
  if ((await viewerPage.$(`iframe[${PRINT_FRAME_ATTRIBUTE}]`)) === null) {
    // The Viewer already prepared the top-level document. Only expose its complete print flow;
    // all paper dimensions, page breaks, fonts, and drawing remain owned by the browser page.
    await viewerPage.addStyleTag({
      content:
        "@media print { html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; } .printing-canvas-container > :last-child { break-after: auto !important; page-break-after: auto !important; } }",
    });
    return await viewerPage.pdf({ printBackground: true, preferCSSPageSize: true });
  }

  // Some Viewer print plugins target a same-origin iframe. Promote that exact print document to
  // a top-level browser page because Chromium's PDF protocol cannot select an iframe print target.
  const html = await serializePrintDocument(viewerPage);
  const printPage = await browser.newPage();
  try {
    printPage.setDefaultTimeout(PAGE_READY_TIMEOUT_MS);
    await printPage.setContent(html, { timeout: PAGE_READY_TIMEOUT_MS, waitUntil: "load" });
    await printPage.evaluate(
      "document.fonts.ready.then(() => Promise.all(Array.from(document.images, (image) => image.complete ? undefined : new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); }))))",
    );
    return await printPage.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await printPage.close().catch(() => undefined);
  }
}

function readPdfPageCount(bytes: Uint8Array): number {
  if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw codedError("RENDER_FAILED", "browser returned a non-PDF payload");
  }
  const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  const pages = source.match(/\/Type\s*\/Page\b/gu)?.length ?? 0;
  if (pages < 1) throw codedError("RENDER_FAILED", "browser returned a PDF with no page objects");
  return pages;
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
