import {
  readDocMarkdown,
  parseDocMarkdownSourceMap,
  DocMarkdownCompileError,
} from "@univer-cli/doc-markdown-facade";
import { writeDocMarkdownExport } from "@univer-cli/doc-markdown-facade/node";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command } from "commander";
import type { LocalUnitContentApplication } from "../unit-content/service.js";

interface ExportMarkdownOptions {
  readonly blocks: string;
  readonly json?: boolean;
  readonly out: string;
  readonly sourceMap: string;
  readonly sourceMapOut?: string;
  readonly unit: string;
  readonly worktree: string;
}

export function createExportMarkdownCommand(content: LocalUnitContentApplication): Command {
  const command = new Command("export-markdown")
    .description("Read selected current Modern Doc blocks into editable Markdown")
    .argument("<file.univer>", "local Univerfile")
    .requiredOption("--worktree <id>", "Worktree to read")
    .requiredOption("--unit <id>", "Doc Unit ID")
    .requiredOption("--blocks <ids>", "comma-separated top-level source block IDs")
    .requiredOption("--source-map <file>", "runtime source map from a successful conversion")
    .requiredOption("--out <fragment.md>", "write the selected Markdown and local assets")
    .option(
      "--source-map-out <file>",
      "write current native identities and revision; defaults to <out>.map.json",
    )
    .option("--json", "write structured JSON")
    .action(async (path: string, options: ExportMarkdownOptions) => {
      try {
        const blockIds = options.blocks.split(",").map((id) => id.trim());
        if (blockIds.some((id) => !id)) command.error("--blocks contains an empty ID");
        const sourceMap = parseDocMarkdownSourceMap(
          JSON.parse(await readFile(options.sourceMap, "utf8")),
        );
        const result = await readDocMarkdown(
          { targetUnitId: options.unit, sourceMap, blockIds },
          {
            async read(code) {
              const readback = await content.read({
                code,
                path,
                unitId: options.unit,
                worktreeId: options.worktree,
              });
              return { value: readback.value, revision: readback.revision };
            },
            async assetResolver(reference) {
              const asset = await content.readAsset({
                path,
                unitId: options.unit,
                worktreeId: options.worktree,
                reference,
              });
              return { data: Buffer.from(asset.data, "base64"), mimeType: asset.mimeType };
            },
          },
        );
        const markdownPath = resolve(options.out);
        const sourceMapPath = resolve(options.sourceMapOut ?? `${options.out}.map.json`);
        await writeDocMarkdownExport(result, { markdownPath, sourceMapPath });
        const output = {
          ...result,
          assets: result.assets.map(({ data: _data, ...asset }) => asset),
          revision: result.revision,
          markdownPath,
          sourceMapPath,
        };
        command
          .configureOutput()
          .writeOut?.(
            options.json
              ? `${JSON.stringify(output, null, 2)}\n`
              : `Exported ${blockIds.length} current Doc block(s) to ${markdownPath} at revision ${result.revision}\n`,
          );
      } catch (error) {
        if (error instanceof DocMarkdownCompileError) {
          throw Object.assign(error, {
            code: error.diagnostics[0]?.code ?? "export-markdown.failed",
            details: { diagnostics: error.diagnostics },
          });
        }
        throw error;
      }
    });
  return command;
}
