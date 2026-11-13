import {
  compileDocMarkdownFile,
  compileDocMarkdownUpdateFile,
  parseDocMarkdownSourceMap,
} from "@univer-cli/doc-markdown-facade";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import type { LocalTypstApplication } from "../typst/service.js";
import type { LocalUnitContentApplication } from "../unit-content/service.js";

interface MarkdownOptions {
  readonly apply?: string;
  readonly blocks?: string;
  readonly diagnosticsOut?: string;
  readonly json?: boolean;
  readonly out?: string;
  readonly sourceMap?: string;
  readonly sourceMapOut?: string;
  readonly title?: string;
  readonly unit: string;
  readonly worktree?: string;
}

export function createCompileMarkdownCommand(
  application: LocalTypstApplication,
  content: LocalUnitContentApplication,
): Command {
  const command = new Command("compile-markdown")
    .description("Compile Markdown into an editable Modern Doc")
    .argument("<source.md>", "Markdown source with optional Univer directives")
    .requiredOption("--unit <id>", "target Doc Unit ID")
    .option("--title <title>", "document title")
    .option("--apply <file.univer>", "create the Doc in a local Univerfile")
    .option("--worktree <id>", "writable Worktree for --apply")
    .option("--blocks <ids>", "replace these comma-separated source block IDs")
    .option("--source-map <file>", "runtime source map from the previous successful apply")
    .option("--out <program.js>", "write generated Facade code")
    .option("--diagnostics-out <file>", "write structured diagnostics")
    .option("--source-map-out <file>", "write source locations and native identities")
    .option("--json", "write structured JSON")
    .action(async (source: string, options: MarkdownOptions) => {
      try {
        if (options.out === undefined && options.apply === undefined) {
          throw new Error("compile-markdown requires --out or --apply");
        }
        if ((options.apply === undefined) !== (options.worktree === undefined)) {
          throw new Error("--apply and --worktree must be provided together");
        }
        const update = options.blocks !== undefined;
        if (update && options.sourceMap === undefined) {
          throw new Error("--blocks requires --source-map");
        }
        if (!update && options.sourceMap !== undefined) {
          throw new Error("--source-map requires --blocks");
        }
        const compileOptions = {
          targetUnitId: options.unit,
          ...(options.title === undefined ? {} : { title: options.title }),
        };
        const blockIds = options.blocks?.split(",").map((id) => id.trim());
        if (blockIds?.some((id) => id.length === 0))
          throw new Error("--blocks contains an empty ID");
        const compiled = update
          ? await compileDocMarkdownUpdateFile(source, {
              ...compileOptions,
              sourceMap: parseDocMarkdownSourceMap(
                JSON.parse(await readFile(options.sourceMap!, "utf8")),
              ),
              blockIds: blockIds!,
            })
          : await compileDocMarkdownFile(source, compileOptions);
        if (options.diagnosticsOut !== undefined) {
          await writeOutput(options.diagnosticsOut, JSON.stringify(compiled.diagnostics, null, 2));
        }
        if (compiled.diagnostics.some((item) => item.severity === "error")) {
          throw Object.assign(new Error("Markdown compilation failed; Doc was not created"), {
            code: "DOC_MARKDOWN_DIAGNOSTICS_ERROR",
            details: { diagnostics: compiled.diagnostics },
          });
        }
        if (options.out !== undefined) await writeOutput(options.out, compiled.javascript);
        const applied =
          options.apply === undefined
            ? undefined
            : update
              ? await content.execute({
                  code: compiled.javascript,
                  path: options.apply,
                  unitId: options.unit,
                  worktreeId: options.worktree!,
                })
              : await application.createDocumentFromProgram({
                  code: compiled.javascript,
                  name: options.title ?? compiled.title,
                  path: options.apply,
                  unitId: options.unit,
                  worktreeId: options.worktree!,
                });
        const sourceMap =
          applied?.value !== null &&
          typeof applied?.value === "object" &&
          !Array.isArray(applied.value) &&
          "sourceMap" in applied.value
            ? applied.value["sourceMap"]
            : compiled.sourceMap;
        if (options.sourceMapOut !== undefined) {
          await writeOutput(
            options.sourceMapOut,
            JSON.stringify({ unitId: options.unit, sourceMap }, null, 2),
          );
        }
        const result = {
          targetUnitId: options.unit,
          title: compiled.title,
          formatVersion: compiled.formatVersion,
          diagnostics: compiled.diagnostics,
          sourceMap,
          ...(options.out === undefined ? {} : { javascriptPath: resolve(options.out) }),
          ...(applied === undefined ? {} : { applied }),
        };
        command
          .configureOutput()
          .writeOut?.(
            options.json === true
              ? `${JSON.stringify(result, null, 2)}\n`
              : `${applied === undefined ? "Compiled" : update ? "Updated" : "Created"} Modern Doc ${options.unit}\n`,
          );
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if ("diagnostics" in error) {
          Object.assign(error, { details: { diagnostics: error.diagnostics } });
          if (options.diagnosticsOut !== undefined) {
            await writeOutput(options.diagnosticsOut, JSON.stringify(error.diagnostics, null, 2));
          }
        }
        const code =
          "code" in error && typeof error.code === "string"
            ? error.code
            : "compile-markdown.failed";
        try {
          command.error(error.message, { code });
        } catch (failure) {
          if (failure instanceof Error && "details" in error)
            Object.assign(failure, { details: error.details });
          throw failure;
        }
      }
    });
  return command;
}

async function writeOutput(path: string, content: string): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${content}\n`, "utf8");
}
