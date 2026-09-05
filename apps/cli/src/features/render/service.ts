import type { Config } from "@univer-cli/config";
import type { DaemonClient } from "@univer-cli/daemon";
import type {
  SvgLineMeasureInput,
  SvgLineMeasureRun,
  SvgTextMeasurer,
} from "@univer-cli/svg-facade";
import {
  createUnitScreenshot,
  type ScreenshotBoundingBox,
  type ScreenshotImage,
  type ScreenshotPageSelector,
  type UnitScreenshotInput,
  type UnitScreenshotResult,
} from "@univer-cli/unit-screenshot";
import { createUnitPdfPrinter, type UnitPdfPrintInput } from "@univer-cli/unit-pdf-printer";
import type { UniverRenderBrowserSetupCommandDependencies } from "@univer-cli/unit-screenshot-command";
import {
  createUnitLayoutLint,
  type UnitLayoutLint,
  type UnitLayoutLintSource,
} from "@univer-cli/unit-layout-lint";
import {
  createUniverRenderRuntime,
  installUniverRenderBrowser,
  probeUniverRenderBrowser,
  resolveUniverRenderBrowser,
  UNIVER_RENDER_BROWSER_CACHE_ENV_VAR,
  type UniverPrintPdfRuntime,
  type UniverRenderRuntime,
  type UniverSlideLayoutRuntime,
  type UniverRenderUnit,
  type UniverTextMeasureRuntime,
} from "@univer-cli/univer-render-runtime";
import type { IDocumentData } from "@univerjs/core";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { resolveRuntimeLicense, resolveScreenshotLimits } from "../../environment/config.js";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";
import { CONTENT_RENDER_SOURCE_METHOD, parseContentRenderSourceResult } from "./protocol.js";

const DEFAULT_SCREENSHOT_DIRECTORY = "./screenshots";

export type LocalScreenshotTarget =
  | {
      readonly kind: "sheet-range";
      readonly range: string;
      readonly sheetName?: string;
    }
  | {
      readonly contactSheet?: {
        readonly tile?: { readonly columns: number; readonly rows: number };
      };
      readonly kind: "slide-pages";
      readonly pages?: readonly ScreenshotPageSelector[];
    }
  | {
      readonly elementIds?: readonly string[];
      readonly kind: "board-content";
      readonly padding?: number;
      readonly region?: ScreenshotBoundingBox;
      readonly scale?: number;
    };

export interface LocalScreenshotOutput extends Omit<ScreenshotImage, "bytes"> {
  readonly location: string;
}

export interface LocalScreenshotResult {
  readonly ok: true;
  readonly outputs: readonly LocalScreenshotOutput[];
  readonly unitId: string;
  readonly unitKind: UniverRenderUnit["unitType"];
}

export interface LocalPrintPdfResult {
  readonly location: string;
  readonly ok: true;
  readonly pageCount: number;
  readonly unitId: string;
  readonly unitKind: Exclude<UniverRenderUnit["unitType"], "base">;
}

export interface ClosableSvgTextMeasurer extends SvgTextMeasurer {
  close(): Promise<void>;
}

export interface LocalRenderSource {
  load(input: {
    readonly cwd?: string;
    readonly path: string;
    readonly unitId?: string;
    readonly worktreeId?: string;
  }): Promise<UniverRenderUnit>;
}

export function createLocalRenderSource(daemon: DaemonClient): LocalRenderSource {
  return {
    async load(input) {
      const cwd = input.cwd ?? process.cwd();
      return parseContentRenderSourceResult(
        await daemon.request(CONTENT_RENDER_SOURCE_METHOD, {
          path: resolveLocalUniverfile(input.path, cwd),
          ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
          ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
        }),
      );
    },
  };
}

export interface LocalRenderApplication {
  readonly browserSetup: UniverRenderBrowserSetupCommandDependencies;
  readonly layoutLint: UnitLayoutLint;
  capture(input: {
    readonly cwd?: string;
    readonly destination?: string;
    readonly path: string;
    readonly target?: LocalScreenshotTarget;
    readonly unitId?: string;
    readonly worktreeId?: string;
  }): Promise<LocalScreenshotResult>;
  createTextMeasurer(): ClosableSvgTextMeasurer;
  loadLayoutLintSource(input: {
    readonly cwd?: string;
    readonly path: string;
    readonly unitId: string;
    readonly worktreeId?: string;
  }): Promise<UnitLayoutLintSource>;
  printPdf(input: {
    readonly cwd?: string;
    readonly destination: string;
    readonly path: string;
    readonly unitId?: string;
    readonly worktreeId?: string;
  }): Promise<LocalPrintPdfResult>;
}

export interface CreateLocalRenderApplicationOptions {
  readonly browserCacheRoot: string;
  readonly browserRuntimeRoot: string;
  readonly config: Config;
  readonly source: LocalRenderSource;
  readonly env?: NodeJS.ProcessEnv;
  readonly runtimeFactory?: (input: {
    readonly browserRuntimeRoot: string;
    readonly env: NodeJS.ProcessEnv;
    readonly license: string;
  }) => Promise<
    UniverPrintPdfRuntime &
      UniverRenderRuntime &
      UniverSlideLayoutRuntime &
      UniverTextMeasureRuntime
  >;
}

/** Bind local paths/config/output files to the target-neutral render and screenshot SDKs. */
export function createLocalRenderApplication(
  options: CreateLocalRenderApplicationOptions,
): LocalRenderApplication {
  const env = renderEnvironment(options.env ?? process.env, options.browserCacheRoot);
  const runtimeFactory =
    options.runtimeFactory ??
    (async (input) =>
      await createUniverRenderRuntime({
        renderPageRoot: input.browserRuntimeRoot,
        env: input.env,
        license: input.license,
      }));

  async function openRuntime(): Promise<
    UniverPrintPdfRuntime &
      UniverRenderRuntime &
      UniverSlideLayoutRuntime &
      UniverTextMeasureRuntime
  > {
    try {
      return await runtimeFactory({
        browserRuntimeRoot: options.browserRuntimeRoot,
        env,
        license: await resolveRuntimeLicense(options.config, env),
      });
    } catch (error) {
      if (error instanceof Error && errorCode(error) === "BROWSER_UNAVAILABLE") {
        throw Object.assign(
          new Error(`${error.message}; run \`univer screenshot setup\` and retry`),
          { code: "BROWSER_UNAVAILABLE" },
        );
      }
      throw error;
    }
  }

  return {
    browserSetup: {
      async install() {
        return await installUniverRenderBrowser({ env });
      },
      async probe(input) {
        await probeUniverRenderBrowser(input);
      },
      async resolve() {
        return await resolveUniverRenderBrowser({ env });
      },
    },
    async capture(input) {
      const source = await options.source.load({
        path: input.path,
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
        ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
        ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
      });
      const runtime = await openRuntime();
      try {
        const limits = await resolveScreenshotLimits(options.config);
        const screenshot = createUnitScreenshot({
          runtime,
          ...(Object.keys(limits).length === 0 ? {} : { limits }),
        });
        const result = await screenshot.capture(
          captureInput(stabilizeScreenshotSource(source), input.target),
        );
        const outputs = await writeScreenshotImages(
          result,
          resolve(input.cwd ?? process.cwd(), input.destination ?? DEFAULT_SCREENSHOT_DIRECTORY),
        );
        return {
          ok: true,
          outputs,
          unitId: result.unitId,
          unitKind: result.unitType,
        };
      } finally {
        await runtime.close();
      }
    },
    async printPdf(input) {
      const cwd = input.cwd ?? process.cwd();
      const location = resolve(cwd, input.destination);
      if (extname(location).toLowerCase() !== ".pdf") {
        throw Object.assign(new Error("PDF output path must end in .pdf"), {
          code: "UNIT_PRINT_PDF_OUTPUT_INVALID",
        });
      }
      if (location === resolveLocalUniverfile(input.path, cwd)) {
        throw Object.assign(new Error("PDF output path must differ from the source Univerfile"), {
          code: "UNIT_PRINT_PDF_OUTPUT_INVALID",
        });
      }
      const source = await options.source.load({
        path: input.path,
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
        ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
        ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
      });
      if (source.unitType === "base") {
        throw Object.assign(new Error("Base Units do not support PDF printing"), {
          code: "UNIT_PRINT_PDF_TYPE_UNSUPPORTED",
        });
      }
      const runtime = await openRuntime();
      try {
        const result = await createUnitPdfPrinter({ runtime }).print(source as UnitPdfPrintInput);
        await mkdir(dirname(location), { recursive: true });
        await writeFile(location, result.bytes);
        return {
          location,
          ok: true,
          pageCount: result.pageCount,
          unitId: result.unitId,
          unitKind: result.unitType,
        };
      } finally {
        await runtime.close();
      }
    },
    layoutLint: {
      async lint(input) {
        const runtime = await openRuntime();
        try {
          return await createUnitLayoutLint({ runtime }).lint(input);
        } finally {
          await runtime.close();
        }
      },
    },
    createTextMeasurer() {
      let runtime:
        | Promise<
            UniverPrintPdfRuntime &
              UniverRenderRuntime &
              UniverSlideLayoutRuntime &
              UniverTextMeasureRuntime
          >
        | undefined;
      const getRuntime = (): Promise<
        UniverPrintPdfRuntime &
          UniverRenderRuntime &
          UniverSlideLayoutRuntime &
          UniverTextMeasureRuntime
      > => {
        runtime ??= openRuntime();
        return runtime;
      };
      return {
        source: "browser-render-runtime",
        async measureLine(input) {
          const metrics = await (
            await getRuntime()
          ).measureText({ doc: textMeasureDocument(input) });
          return {
            ascent: metrics.firstLineAscent,
            descent: metrics.firstLineDescent,
            width: metrics.actualWidth,
          };
        },
        async close() {
          if (runtime !== undefined) await (await runtime).close();
        },
      };
    },
    async loadLayoutLintSource(input) {
      const source = await options.source.load({
        path: input.path,
        unitId: input.unitId,
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
        ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
      });
      if (source.unitType !== "slide") {
        throw Object.assign(
          new Error(
            `Unit ${input.unitId} is ${source.unitType}; layout lint requires a Slide Unit`,
          ),
          { code: "UNIT_LAYOUT_LINT_TYPE_UNSUPPORTED" },
        );
      }
      return {
        unitType: "slide",
        unitData: source.unitData,
        ...(source.formulaReferenceUnits === undefined
          ? {}
          : { formulaReferenceUnits: source.formulaReferenceUnits }),
      };
    },
  };
}

function stabilizeScreenshotSource(source: UniverRenderUnit): UniverRenderUnit {
  if (source.unitType !== "board") return source;

  const pages = stabilizeBoardPages(source.unitData.pages);
  const slides =
    source.unitData.slides === undefined ? undefined : stabilizeBoardPages(source.unitData.slides);
  if (pages === source.unitData.pages && slides === source.unitData.slides) return source;

  return {
    ...source,
    unitData: { ...source.unitData, pages, ...(slides === undefined ? {} : { slides }) },
  };
}

type BoardPages = Extract<UniverRenderUnit, { readonly unitType: "board" }>["unitData"]["pages"];

function stabilizeBoardPages(pages: BoardPages): BoardPages {
  let changed = false;
  const stablePages = Object.fromEntries(
    Object.entries(pages).map(([pageId, page]) => {
      let pageChanged = false;
      const elements = Object.fromEntries(
        Object.entries(page.elements).map(([elementId, element]) => {
          if (
            !("connectorData" in element) ||
            element.connectorData.style?.animation === undefined
          ) {
            return [elementId, element];
          }
          const { animation: _animation, ...style } = element.connectorData.style;
          changed = true;
          pageChanged = true;
          return [elementId, { ...element, connectorData: { ...element.connectorData, style } }];
        }),
      );
      return [pageId, pageChanged ? { ...page, elements } : page];
    }),
  );

  return changed ? stablePages : pages;
}

function captureInput(
  source: UniverRenderUnit,
  target: LocalScreenshotTarget | undefined,
): UnitScreenshotInput {
  if (target === undefined) return source;
  switch (source.unitType) {
    case "sheet":
      if (target.kind !== "sheet-range") throw invalidTarget(source.unitType, target.kind);
      return { ...source, target };
    case "slide":
      if (target.kind !== "slide-pages") throw invalidTarget(source.unitType, target.kind);
      return { ...source, target };
    case "board":
      if (target.kind !== "board-content") throw invalidTarget(source.unitType, target.kind);
      return { ...source, target };
    case "doc":
    case "base":
      throw invalidTarget(source.unitType, target.kind);
  }
}

async function writeScreenshotImages(
  result: UnitScreenshotResult,
  directory: string,
): Promise<readonly LocalScreenshotOutput[]> {
  await mkdir(directory, { recursive: true });
  return await Promise.all(
    result.images.map(async ({ bytes, ...image }) => {
      if (basename(image.name) !== image.name) {
        throw Object.assign(new Error(`Unsafe screenshot image name: ${image.name}`), {
          code: "SCREENSHOT_OUTPUT_INVALID",
        });
      }
      const location = resolve(directory, image.name);
      await writeFile(location, bytes);
      return { ...image, location };
    }),
  );
}

function textMeasureDocument(input: SvgLineMeasureInput): IDocumentData {
  const dataStream = input.runs.map((run) => run.text).join("");
  let offset = 0;
  const textRuns = input.runs.map((run) => {
    const st = offset;
    offset += run.text.length;
    return { st, ed: offset, ts: runStyle(run) };
  });
  return {
    id: "svg-facade-measure",
    body: {
      dataStream: `${dataStream}\r\n`,
      textRuns,
      paragraphs: [{ startIndex: dataStream.length, paragraphId: "svg-facade-measure-p0" }],
    },
    documentStyle: {
      pageSize: { width: 1_000_000, height: 1_000_000 },
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    },
  };
}

function runStyle(run: SvgLineMeasureRun): Record<string, unknown> {
  return {
    fs: run.fontSizePx * 0.75,
    ...(run.bold ? { bl: 1 } : {}),
    ...(run.italic ? { it: 1 } : {}),
    ...(run.fontFamily === undefined ? {} : { ff: run.fontFamily }),
  };
}

function renderEnvironment(env: NodeJS.ProcessEnv, browserCacheRoot: string): NodeJS.ProcessEnv {
  const configured = env[UNIVER_RENDER_BROWSER_CACHE_ENV_VAR]?.trim();
  return {
    ...env,
    [UNIVER_RENDER_BROWSER_CACHE_ENV_VAR]: configured || browserCacheRoot,
  };
}

function invalidTarget(unitType: string, target: string): Error {
  return Object.assign(new Error(`${target} screenshot target is invalid for ${unitType}`), {
    code: "SCREENSHOT_TARGET_INVALID",
  });
}

function errorCode(error: Error): string | undefined {
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
