import { createUnitLayoutLintCommand } from "@univer-cli/unit-layout-lint-command";
import type { Command } from "commander";
import type { LocalRenderApplication } from "../render/service.js";

interface LocalLayoutLintOptions {
  readonly file: string;
  readonly worktree?: string;
}

/** Add Local `.univer` addressing to the target-neutral CLI SDK lint preset. */
export function createLocalLayoutLintCommand(application: LocalRenderApplication): Command {
  let command: Command;
  command = createUnitLayoutLintCommand({
    lint: application.layoutLint,
    async loadUnit({ unitId }) {
      const options = command.opts<LocalLayoutLintOptions>();
      return await application.loadLayoutLintSource({
        path: options.file,
        unitId,
        ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
      });
    },
  });
  return command
    .requiredOption("--file <file.univer>", "local .univer file containing the Slide Unit")
    .option("--worktree <id>", "read a Worktree; defaults to trunk");
}
