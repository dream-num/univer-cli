import type { DaemonClient } from "@univer-cli/daemon";
import type { FormulaCalculationMode } from "@univer-cli/unit-exchange";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  CONTENT_EXPORT_METHOD,
  CONTENT_IMPORT_METHOD,
  parseContentExportResult,
  parseContentImportResult,
  type ContentExportResult,
  type ContentImportResult,
  type ExchangeUnitKind,
} from "./protocol.js";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";

export interface LocalExchangeApplication {
  importFile(input: {
    readonly cwd?: string;
    readonly formulaCalculationMode?: FormulaCalculationMode;
    readonly kind: ExchangeUnitKind;
    readonly name: string;
    readonly path: string;
    readonly sourcePath: string;
    readonly worktreeId?: string;
  }): Promise<ContentImportResult>;
  exportFile(input: {
    readonly cwd?: string;
    readonly formulaCalculationMode?: FormulaCalculationMode;
    readonly outputPath: string;
    readonly path: string;
    readonly sheetName?: string;
    readonly tableName?: string;
    readonly unitId?: string;
    readonly worktreeId?: string;
  }): Promise<ContentExportResult>;
}

export interface CreateLocalExchangeApplicationOptions {
  readonly fetch?: typeof fetch;
  readonly temporaryRoot?: string;
}

export function createLocalExchangeApplication(
  daemon: DaemonClient,
  options: CreateLocalExchangeApplicationOptions = {},
): LocalExchangeApplication {
  const fetchRemote = options.fetch ?? fetch;
  return {
    async importFile(input) {
      const cwd = input.cwd ?? process.cwd();
      const source = await prepareImportSource({
        cwd,
        fetchRemote,
        source: input.sourcePath,
        temporaryRoot: options.temporaryRoot ?? tmpdir(),
      });
      try {
        const result = parseContentImportResult(
          await daemon.request(CONTENT_IMPORT_METHOD, {
            kind: input.kind,
            name: input.name,
            path: resolveLocalUniverfile(input.path, cwd),
            sourcePath: source.converterPath,
            ...(input.formulaCalculationMode === undefined
              ? {}
              : { formulaCalculationMode: input.formulaCalculationMode }),
            ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
          }),
        );
        return { ...result, sourcePath: source.userSource };
      } finally {
        await source.dispose();
      }
    },
    async exportFile(input) {
      const cwd = input.cwd ?? process.cwd();
      return parseContentExportResult(
        await daemon.request(CONTENT_EXPORT_METHOD, {
          outputPath: resolve(cwd, input.outputPath),
          path: resolveLocalUniverfile(input.path, cwd),
          ...(input.formulaCalculationMode === undefined
            ? {}
            : { formulaCalculationMode: input.formulaCalculationMode }),
          ...(input.sheetName === undefined ? {} : { sheetName: input.sheetName }),
          ...(input.tableName === undefined ? {} : { tableName: input.tableName }),
          ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
          ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
        }),
      );
    },
  };
}

interface PreparedImportSource {
  readonly converterPath: string;
  dispose(): Promise<void>;
  readonly userSource: string;
}

async function prepareImportSource(input: {
  readonly cwd: string;
  readonly fetchRemote: typeof fetch;
  readonly source: string;
  readonly temporaryRoot: string;
}): Promise<PreparedImportSource> {
  const remote = parseRemoteImportSource(input.source);
  if (remote === undefined) {
    const converterPath = input.source.startsWith("file:")
      ? fileURLToPath(new URL(input.source))
      : resolve(input.cwd, input.source);
    return { converterPath, async dispose() {}, userSource: converterPath };
  }

  const directory = await mkdtemp(join(input.temporaryRoot, "univer-cli-remote-import-"));
  const converterPath = join(directory, `source${remote.extension}`);
  try {
    const response = await input.fetchRemote(remote.url, {
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)} ${response.statusText}`.trim());
    }
    if (response.body === null) throw new Error("response body is empty");
    await pipeline(Readable.fromWeb(response.body), createWriteStream(converterPath));
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw Object.assign(
      new Error(
        `Remote import download failed for ${formatRemoteSource(remote.url)}: ${safeRemoteError(error)}`,
        error instanceof Error ? { cause: error } : undefined,
      ),
      { code: "IMPORT_REMOTE_DOWNLOAD_FAILED" },
    );
  }
  return {
    converterPath,
    async dispose() {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    },
    userSource: input.source,
  };
}

function parseRemoteImportSource(
  source: string,
): { readonly extension: string; readonly url: string } | undefined {
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(source)) return undefined;
  const url = new URL(source);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(
      new Error(
        `Remote import does not support ${url.protocol}; use an HTTP(S) URL or local file path`,
      ),
      { code: "IMPORT_REMOTE_SCHEME_UNSUPPORTED" },
    );
  }
  const extension = extname(url.pathname).toLowerCase();
  if (!IMPORT_SOURCE_EXTENSIONS.has(extension)) {
    throw Object.assign(
      new Error(`Remote import URL uses unsupported source extension ${JSON.stringify(extension)}`),
      { code: "IMPORT_REMOTE_FORMAT_UNSUPPORTED" },
    );
  }
  return { extension, url: url.href };
}

const IMPORT_SOURCE_EXTENSIONS = new Set([
  ".xls",
  ".xlsx",
  ".xlsm",
  ".csv",
  ".tsv",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".pptm",
  ".ppsx",
  ".ppsm",
  ".potx",
]);

function formatRemoteSource(source: string): string {
  const url = new URL(source);
  return `${url.protocol}//${url.host}${url.pathname}`;
}

function safeRemoteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/[^\s"'<>]+/giu, (source) => {
    try {
      return formatRemoteSource(source);
    } catch {
      return "<remote-url>";
    }
  });
}
