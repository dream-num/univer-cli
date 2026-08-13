import { Command } from "commander";
import type { UpdateApplication, UpdateResult } from "./service.js";

interface UpdateOptions {
  readonly force?: boolean;
  readonly json?: boolean;
}

export function createUpdateCommand(application: UpdateApplication): Command {
  const command = new Command("update")
    .description("Update Univer CLI on the current release channel")
    .option("--force", "stop the shared daemon before updating")
    .option("--json", "write structured JSON")
    .action(async (options: UpdateOptions) => {
      const result = await application.update({
        force: options.force === true,
        progress: (message) => {
          if (options.json !== true) command.configureOutput().writeErr?.(`${message}\n`);
        },
      });
      command
        .configureOutput()
        .writeOut?.(
          `${options.json === true ? JSON.stringify(result, null, 2) : renderUpdate(result)}\n`,
        );
    });
  return command;
}

function renderUpdate(result: UpdateResult): string {
  return [
    `Current version: ${result.currentVersion}`,
    `Release channel: ${result.channel}`,
    `Latest version: ${result.latestVersion}`,
    result.status === "updated"
      ? `Updated Univer CLI to v${result.latestVersion}.`
      : `Univer CLI v${result.currentVersion} is already up to date.`,
  ].join("\n");
}
