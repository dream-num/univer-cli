import type { ScreenshotPageSelector } from "@univer-cli/unit-screenshot";
import { createUniverRenderBrowserSetupCommand } from "@univer-cli/unit-screenshot-command";
import { Command } from "commander";
import type { LocalRenderApplication, LocalScreenshotTarget } from "./service.js";

const MAX_EXPANDED_PAGES = 10_000;

interface ScreenshotOptions {
  readonly contactSlide?: boolean;
  readonly elements?: string;
  readonly json?: boolean;
  readonly out?: string;
  readonly padding?: string;
  readonly pages?: string;
  readonly range?: string;
  readonly region?: string;
  readonly scale?: string;
  readonly sheet?: string;
  readonly tile?: string;
  readonly unit?: string;
  readonly worktree?: string;
}

/** Compose the SDK screenshot capability with Local Univerfile addressing. */
export function createScreenshotCommand(application: LocalRenderApplication): Command {
  const command = new Command("screenshot")
    .description("Render a local Univerfile Unit as PNG images")
    .argument("<file.univer>", "local .univer file")
    .option("--worktree <id>", "read a Worktree; defaults to trunk")
    .option("--unit <unit-id>", "Unit to capture; optional only when the scope has one Unit")
    .option("--pages <pages>", "Slide pages or page IDs, for example 1,3-5,cover or all")
    .option("--contact-slide", "Slide overview containing all captured pages")
    .option("--tile <columns>x<rows>", "Contact slide grid, for example 4x2")
    .option("--sheet <name>", "Sheet name used with --range")
    .option("--range <a1-range>", "Sheet range, for example B2:H40")
    .option("--region <left,top,width,height>", "Board region")
    .option("--elements <ids>", "Board element IDs separated by commas")
    .option("--padding <pixels>", "Board content padding")
    .option("--scale <factor>", "Board selector scale between 0.1 and 4")
    .option("--out <directory>", "output directory; defaults to ./screenshots")
    .option("--json", "write a structured output summary as JSON")
    .action(async (path: string, options: ScreenshotOptions) => {
      try {
        const target = screenshotTarget(options);
        const result = await application.capture({
          path,
          ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
          ...(options.unit === undefined ? {} : { unitId: options.unit }),
          ...(options.out === undefined ? {} : { destination: options.out }),
          ...(target === undefined ? {} : { target }),
        });
        command
          .configureOutput()
          .writeOut?.(
            options.json === true
              ? `${JSON.stringify(result, null, 2)}\n`
              : `${result.outputs.map(({ location }) => location).join("\n")}\n`,
          );
      } catch (error) {
        fail(command, error);
      }
    });

  command.addCommand(createUniverRenderBrowserSetupCommand(application.browserSetup));
  return command;
}

function screenshotTarget(options: ScreenshotOptions): LocalScreenshotTarget | undefined {
  const usesSheet = options.sheet !== undefined || options.range !== undefined;
  const usesSlide =
    options.pages !== undefined || options.contactSlide === true || options.tile !== undefined;
  const usesBoard =
    options.region !== undefined ||
    options.elements !== undefined ||
    options.padding !== undefined ||
    options.scale !== undefined;
  if ([usesSheet, usesSlide, usesBoard].filter(Boolean).length > 1) {
    throw codedError(
      "SCREENSHOT_INPUT_INVALID",
      "Sheet, Slide, and Board selector options cannot be combined",
    );
  }
  if (usesSheet) {
    if (options.range === undefined) {
      throw codedError("SCREENSHOT_INPUT_INVALID", "--sheet requires --range");
    }
    return {
      kind: "sheet-range",
      range: options.range,
      ...(options.sheet === undefined ? {} : { sheetName: options.sheet }),
    };
  }
  if (usesSlide) {
    if (options.tile !== undefined && options.contactSlide !== true) {
      throw codedError("SCREENSHOT_INPUT_INVALID", "--tile requires --contact-slide");
    }
    const pages = parseOptionalPageSelectors(options.pages);
    const tile = parseOptionalTile(options.tile);
    return {
      kind: "slide-pages",
      ...(pages === undefined ? {} : { pages }),
      ...(options.contactSlide === true
        ? { contactSheet: tile === undefined ? {} : { tile } }
        : {}),
    };
  }
  if (usesBoard) {
    const elementIds = parseOptionalElements(options.elements);
    const region = parseOptionalRegion(options.region);
    const padding = parseOptionalNumber("--padding", options.padding);
    const scale = parseOptionalNumber("--scale", options.scale);
    if (elementIds !== undefined && region !== undefined) {
      throw codedError(
        "SCREENSHOT_INPUT_INVALID",
        "--elements and --region cannot be used together",
      );
    }
    if (
      elementIds === undefined &&
      region === undefined &&
      (padding !== undefined || scale !== undefined)
    ) {
      throw codedError(
        "SCREENSHOT_INPUT_INVALID",
        "--padding and --scale require --region or --elements",
      );
    }
    return {
      kind: "board-content",
      ...(elementIds === undefined ? {} : { elementIds }),
      ...(region === undefined ? {} : { region }),
      ...(padding === undefined ? {} : { padding }),
      ...(scale === undefined ? {} : { scale }),
    };
  }
  return undefined;
}

function parseOptionalPageSelectors(
  value: string | undefined,
): readonly ScreenshotPageSelector[] | undefined {
  if (value === undefined || value.trim() === "all") return undefined;
  if (value.trim().length === 0) {
    throw codedError("SCREENSHOT_INPUT_INVALID", "--pages cannot be empty");
  }
  const pages: ScreenshotPageSelector[] = [];
  for (const token of value.split(",")) {
    const normalized = token.trim();
    if (normalized.length === 0) {
      throw codedError("SCREENSHOT_INPUT_INVALID", "--pages contains an empty selector");
    }
    const match = /^(\d+)(?:-(\d+))?$/u.exec(normalized);
    if (match === null) {
      pages.push(normalized);
      continue;
    }
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
      throw codedError(
        "SCREENSHOT_INPUT_INVALID",
        `Invalid --pages range ${JSON.stringify(normalized)}`,
      );
    }
    if (end - start + 1 > MAX_EXPANDED_PAGES) {
      throw codedError(
        "SCREENSHOT_INPUT_INVALID",
        `A --pages range cannot exceed ${MAX_EXPANDED_PAGES} pages`,
      );
    }
    for (let page = start; page <= end; page += 1) pages.push(page);
    if (pages.length > MAX_EXPANDED_PAGES) {
      throw codedError(
        "SCREENSHOT_INPUT_INVALID",
        `--pages cannot expand to more than ${MAX_EXPANDED_PAGES} pages`,
      );
    }
  }
  return [...new Set(pages)];
}

function parseOptionalTile(
  value: string | undefined,
): { readonly columns: number; readonly rows: number } | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d+)x(\d+)$/iu.exec(value.trim());
  const columns = Number(match?.[1]);
  const rows = Number(match?.[2]);
  if (
    match === null ||
    !Number.isSafeInteger(columns) ||
    columns < 1 ||
    !Number.isSafeInteger(rows) ||
    rows < 1
  ) {
    throw codedError(
      "SCREENSHOT_INPUT_INVALID",
      `Invalid --tile ${JSON.stringify(value)}; expected <columns>x<rows>`,
    );
  }
  return { columns, rows };
}

function parseOptionalElements(value: string | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const elementIds = [...new Set(value.split(",").map((id) => id.trim()))];
  if (elementIds.some((id) => id.length === 0)) {
    throw codedError("SCREENSHOT_INPUT_INVALID", "--elements must contain non-empty IDs");
  }
  return elementIds;
}

function parseOptionalRegion(
  value: string | undefined,
):
  | { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
  | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(",");
  const values = parts.map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => part.trim().length === 0) ||
    !values.every(Number.isFinite)
  ) {
    throw codedError(
      "SCREENSHOT_INPUT_INVALID",
      "--region must contain left,top,width,height as finite numbers",
    );
  }
  const [left, top, width, height] = values as [number, number, number, number];
  if (width <= 0 || height <= 0) {
    throw codedError("SCREENSHOT_INPUT_INVALID", "--region width and height must be positive");
  }
  return { left, top, width, height };
}

function parseOptionalNumber(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value.trim().length === 0 || !Number.isFinite(number)) {
    throw codedError("SCREENSHOT_INPUT_INVALID", `${name} must be a finite number`);
  }
  return number;
}

function fail(command: Command, error: unknown): never {
  if (!(error instanceof Error)) throw error;
  try {
    command.error(error.message, { code: errorCode(error), exitCode: 1 });
  } catch (commanderError) {
    const details = (error as Error & { readonly details?: unknown }).details;
    if (details !== undefined && commanderError instanceof Error) {
      Object.assign(commanderError, { details });
    }
    throw commanderError;
  }
}

function errorCode(error: Error): string {
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : "SCREENSHOT_FAILED";
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
