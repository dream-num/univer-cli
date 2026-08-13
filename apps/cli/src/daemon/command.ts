import type { DaemonControl, DaemonIdentity, DaemonStatus } from "@univer-cli/daemon";
import { createDaemonCommand } from "@univer-cli/daemon-command";
import type { Command } from "commander";
import {
  readApplicationDaemonStatus,
  type ApplicationDaemonStatus,
  type ApplicationGatewayStatus,
  type GatewayInfoReader,
} from "./status.js";

interface OutputOptions {
  readonly json?: boolean;
}

export function createApplicationDaemonCommand(input: {
  readonly control: DaemonControl;
  readonly readGatewayInfo: GatewayInfoReader;
}): Command {
  const command = createDaemonCommand({ control: input.control });
  const status = command.commands.find((candidate) => candidate.name() === "status");
  if (status === undefined) throw new Error("CLI SDK daemon command is missing status");
  status.action(async () => {
    const options = status.optsWithGlobals<OutputOptions>();
    const result = await execute(
      status,
      async () => await readApplicationDaemonStatus(input.control, input.readGatewayInfo),
    );
    writeOutput(status, options, applicationStatusJson(result), renderApplicationStatus(result));
  });
  return command;
}

async function execute<Result>(
  command: Command,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (isCodedError(error)) {
      command.error(`${error.code}: ${error.message}`, { code: "daemon.failed", exitCode: 1 });
    }
    throw error;
  }
}

function writeOutput(command: Command, options: OutputOptions, value: unknown, text: string): void {
  command
    .configureOutput()
    .writeOut?.(`${options.json === true ? JSON.stringify(value, null, 2) : text}\n`);
}

function applicationStatusJson(result: ApplicationDaemonStatus): unknown {
  return { ...result.daemon, gateway: result.gateway };
}

function renderApplicationStatus(result: ApplicationDaemonStatus): string {
  return [renderDaemonStatus(result.daemon), ...renderGatewayStatus(result.gateway)].join("\n");
}

function renderDaemonStatus(status: DaemonStatus): string {
  switch (status.state) {
    case "running":
      return renderRunning("Daemon: running", status);
    case "stopped":
      return `Daemon: stopped\nSocket: ${status.socketPath}`;
    case "unreachable":
      return [
        "Daemon: unreachable",
        `Error: ${renderDiagnostic(status.diagnostic)}`,
        `Socket: ${status.socketPath}`,
      ].join("\n");
    case "incompatible":
      return [
        "Daemon: incompatible",
        `Reason: ${status.reason}`,
        `Expected: ${renderIdentity(status.expected.identity, status.expected.protocolVersion)}`,
        ...(status.actual === undefined
          ? []
          : [`Actual: ${renderIdentity(status.actual.identity, status.actual.protocolVersion)}`]),
        ...(status.diagnostic === undefined
          ? []
          : [`Error: ${renderDiagnostic(status.diagnostic)}`]),
        `Socket: ${status.socketPath}`,
      ].join("\n");
  }
}

function renderRunning(
  heading: string,
  status: Extract<DaemonStatus, { readonly state: "running" }>,
): string {
  return [
    heading,
    `Identity: ${status.identity.id}`,
    `Version: ${status.identity.version}`,
    ...(status.identity.buildId === undefined ? [] : [`Build ID: ${status.identity.buildId}`]),
    `Protocol: ${String(status.protocolVersion)}`,
    `PID: ${String(status.pid)}`,
    `Started at: ${status.startedAt}`,
    `Socket: ${status.socketPath}`,
  ].join("\n");
}

function renderIdentity(identity: DaemonIdentity, protocolVersion: number): string {
  return `${identity.id}@${identity.version}${identity.buildId === undefined ? "" : ` (build ${identity.buildId})`}, protocol ${String(protocolVersion)}`;
}

function renderGatewayStatus(status: ApplicationGatewayStatus): readonly string[] {
  switch (status.state) {
    case "running":
      return [
        "Gateway: running",
        `Gateway origin: ${status.origin}`,
        `Gateway view: ${status.viewUrl}`,
      ];
    case "stopped":
      return ["Gateway: stopped"];
    case "unreachable":
      return ["Gateway: unreachable", `Gateway error: ${renderDiagnostic(status.diagnostic)}`];
    case "unknown":
      return ["Gateway: unknown", `Gateway reason: ${status.reason}`];
  }
}

function renderDiagnostic(diagnostic: {
  readonly code?: string;
  readonly message: string;
}): string {
  return diagnostic.code === undefined
    ? diagnostic.message
    : `${diagnostic.code}: ${diagnostic.message}`;
}

function isCodedError(error: unknown): error is Error & { readonly code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.length > 0
  );
}
