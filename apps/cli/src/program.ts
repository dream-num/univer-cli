import { createStandardApiReference, type ApiReference } from "@univer-cli/api-reference";
import { createApiCommand } from "@univer-cli/api-reference-command";
import { createConfigCommand } from "@univer-cli/config-command";
import {
  createDaemonClient,
  createDaemonControl,
  type DaemonClient,
  type DaemonControl,
} from "@univer-cli/daemon";
import {
  createNodeResourceLibraryFactory,
  type ResourceLibrary,
} from "@univer-cli/resource-library";
import { createResourcesCommand } from "@univer-cli/resource-library-command";
import { type SvgTextMeasurer } from "@univer-cli/svg-facade";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, type OutputConfiguration } from "commander";
import packageMetadata from "../package.json" with { type: "json" };
import { createApplicationDaemonCommand } from "./daemon/command.js";
import { createDaemonControlWithLegacyTakeover } from "./daemon/control.js";
import { applicationDaemonIdentity } from "./daemon/identity.js";
import {
  GATEWAY_INFO_METHOD,
  parseGatewayInfo,
  type GatewayInfoResult,
} from "./daemon/protocol.js";
import { createApplicationConfig } from "./environment/config.js";
import { resolveApplicationPaths } from "./environment/paths.js";
import { createExchangeCommands } from "./features/exchange/command.js";
import {
  createLocalExchangeApplication,
  type LocalExchangeApplication,
} from "./features/exchange/service.js";
import { createDoctorCommand } from "./features/doctor/command.js";
import type { Doctor } from "./features/doctor/model.js";
import { createLocalDoctor } from "./features/doctor/service.js";
import { createLocalLayoutLintCommand } from "./features/lint/command.js";
import { createOptimizeCommand } from "./features/optimize/command.js";
import {
  createLocalOptimizeApplication,
  type LocalOptimizeApplication,
} from "./features/optimize/service.js";
import { createScreenshotCommand } from "./features/render/screenshot-command.js";
import {
  createLocalRenderApplication,
  createLocalRenderSource,
  type LocalRenderApplication,
} from "./features/render/service.js";
import { createSkillsCommand } from "./features/skills/command.js";
import { createApplicationSkillLibrary, type SkillLibrary } from "./features/skills/library.js";
import { createUpdateCommand } from "./features/update/command.js";
import { createLocalUpdateApplication, type UpdateApplication } from "./features/update/service.js";
import { checkForUpdateAtStartup } from "./features/update/startup.js";
import { createCompileSvgCommand } from "./features/svg/command.js";
import { createCompileTypstCommand } from "./features/typst/command.js";
import {
  createLocalTypstApplication,
  type LocalTypstApplication,
} from "./features/typst/service.js";
import { createUnitCommand } from "./features/unit/command.js";
import { createLocalUnitApplication, type LocalUnitApplication } from "./features/unit/service.js";
import { createUnitContentCommands } from "./features/unit-content/command.js";
import {
  createLocalUnitContentApplication,
  type LocalUnitContentApplication,
} from "./features/unit-content/service.js";
import { createUniverfileCommands } from "./features/univerfile/command.js";
import {
  createLocalUniverfileApplication,
  type LocalUniverfileApplication,
} from "./features/univerfile/service.js";
import { createWorktreeCommand } from "./features/worktree/command.js";
import {
  createLocalWorktreeApplication,
  type LocalWorktreeApplication,
} from "./features/worktree/service.js";

export const PROGRAM_NAME = "univer";

const HELP_GROUPS = {
  authoring: "Authoring:",
  collaboration: "Collaboration:",
  exchange: "Data Exchange:",
  maintenance: "Data Maintenance:",
  reference: "Resources & Reference:",
  rendering: "Rendering:",
  system: "System:",
  unitOperations: "Unit Operations:",
  univerfile: "Univerfile:",
} as const;

export interface UniverLocalProgramOptions {
  readonly exchangeApplication?: LocalExchangeApplication;
  readonly daemonControl?: DaemonControl;
  readonly daemonEntry?: URL;
  readonly daemonGatewayInfo?: () => Promise<GatewayInfoResult>;
  readonly doctor?: Doctor;
  readonly env?: NodeJS.ProcessEnv;
  readonly optimizeApplication?: LocalOptimizeApplication;
  readonly output?: OutputConfiguration;
  readonly packageRoot?: string;
  readonly reference?: ApiReference;
  readonly renderApplication?: LocalRenderApplication;
  readonly browserRuntimeRoot?: string;
  readonly resourceLibrary?: () => ResourceLibrary;
  readonly socketPath?: string;
  readonly skillLibrary?: SkillLibrary;
  readonly svgTextMeasurer?: SvgTextMeasurer;
  readonly typstApplication?: LocalTypstApplication;
  readonly unitApplication?: LocalUnitApplication;
  readonly unitContentApplication?: LocalUnitContentApplication;
  readonly univerfileApplication?: LocalUniverfileApplication;
  readonly updateApplication?: UpdateApplication;
  readonly version?: string;
  readonly interactive?: boolean;
  readonly worktreeApplication?: LocalWorktreeApplication;
}

/** The application composition root. Target-specific adapters are added here as they become real. */
export function createProgram(options: UniverLocalProgramOptions = {}): Command {
  const env = options.env ?? process.env;
  const version = options.version ?? packageMetadata.version;
  const output = options.output ?? {
    writeErr: (text: string): boolean => process.stderr.write(text),
    writeOut: (text: string): boolean => process.stdout.write(text),
  };
  const program = new Command(PROGRAM_NAME)
    .description("Agent-friendly authoring and verification for office content")
    .version(version)
    .configureOutput(output);

  const identity = { ...applicationDaemonIdentity(env), version };
  const paths = resolveApplicationPaths(env);
  const packageRoot = options.packageRoot ?? defaultApplicationPackageRoot();
  const config = createApplicationConfig(paths);
  const socketPath = options.socketPath ?? paths.socketPath;
  const daemonOptions = {
    entry: options.daemonEntry ?? defaultDaemonEntry(),
    env,
    identity,
    requestTimeoutMs: 180_000,
    socketPath,
  };
  const daemon = createDaemonClient(daemonOptions);
  const control =
    options.daemonControl ??
    createDaemonControlWithLegacyTakeover({
      control: createDaemonControl(daemonOptions),
      identity,
      socketPath,
    });
  const applicationDaemon: DaemonClient = {
    async request(method, payload) {
      await control.start();
      return await daemon.request(method, payload);
    },
  };
  const univerfileApplication =
    options.univerfileApplication ?? createLocalUniverfileApplication(applicationDaemon);
  const exchangeApplication =
    options.exchangeApplication ?? createLocalExchangeApplication(applicationDaemon);
  const optimizeApplication =
    options.optimizeApplication ?? createLocalOptimizeApplication(applicationDaemon);
  const worktreeApplication =
    options.worktreeApplication ?? createLocalWorktreeApplication(applicationDaemon);
  const unitApplication = options.unitApplication ?? createLocalUnitApplication(applicationDaemon);
  const unitContentApplication =
    options.unitContentApplication ?? createLocalUnitContentApplication(applicationDaemon);
  const typstApplication =
    options.typstApplication ?? createLocalTypstApplication(applicationDaemon);
  const renderApplication =
    options.renderApplication ??
    createLocalRenderApplication({
      browserCacheRoot: join(paths.homeDir, "browsers"),
      browserRuntimeRoot: options.browserRuntimeRoot ?? defaultBrowserRuntimeRoot(),
      config,
      env,
      source: createLocalRenderSource(applicationDaemon),
    });
  const doctor =
    options.doctor ??
    createLocalDoctor({
      browserSetup: renderApplication.browserSetup,
      config,
      control,
      paths,
      version,
    });
  const skillLibrary =
    options.skillLibrary ?? createApplicationSkillLibrary(defaultSkillAssetRoot());
  const updateApplication =
    options.updateApplication ??
    createLocalUpdateApplication({
      control,
      homeDir: paths.homeDir,
      packageRoot,
      version,
    });

  program.hook("preAction", async (_root, actionCommand) => {
    if (actionCommand.name() === "update") return;
    await checkForUpdateAtStartup({
      config,
      entryPath: process.argv[1],
      env,
      homeDir: paths.homeDir,
      interactive:
        options.interactive ?? (process.stdin.isTTY === true && process.stderr.isTTY === true),
      json: actionCommand.optsWithGlobals<{ readonly json?: boolean }>().json === true,
      packageRoot,
      version,
      writeErr: (text) => {
        output.writeErr?.(text);
      },
    });
  });

  addCommands(
    program,
    createUniverfileCommands(univerfileApplication),
    HELP_GROUPS.univerfile,
    output,
  );
  addCommands(program, createExchangeCommands(exchangeApplication), HELP_GROUPS.exchange, output);
  addCommands(
    program,
    [createWorktreeCommand(worktreeApplication)],
    HELP_GROUPS.collaboration,
    output,
  );
  addCommands(
    program,
    [
      createUnitCommand(unitApplication),
      ...createUnitContentCommands(unitContentApplication),
      createLocalLayoutLintCommand(renderApplication),
    ],
    HELP_GROUPS.unitOperations,
    output,
  );
  addCommands(program, [createScreenshotCommand(renderApplication)], HELP_GROUPS.rendering, output);
  addCommands(
    program,
    [
      createCompileSvgCommand({
        createTextMeasurer:
          options.svgTextMeasurer === undefined
            ? () => renderApplication.createTextMeasurer()
            : () => options.svgTextMeasurer!,
        unitContent: unitContentApplication,
      }),
      createCompileTypstCommand(typstApplication),
    ],
    HELP_GROUPS.authoring,
    output,
  );
  addCommands(
    program,
    [
      createResourcesCommand({
        openLibrary:
          options.resourceLibrary ??
          createNodeResourceLibraryFactory({
            cacheRoot: join(paths.homeDir, "cache", "resources"),
            manifestPath: defaultResourceManifestPath(),
          }),
      }),
      createApiCommand({ reference: options.reference ?? createStandardApiReference() }),
    ],
    HELP_GROUPS.reference,
    output,
  );
  addCommands(
    program,
    [createOptimizeCommand(optimizeApplication)],
    HELP_GROUPS.maintenance,
    output,
  );
  addCommands(
    program,
    [
      createConfigCommand({ config }),
      createDoctorCommand(doctor),
      createSkillsCommand(skillLibrary),
      createUpdateCommand(updateApplication),
      createApplicationDaemonCommand({
        control,
        readGatewayInfo:
          options.daemonGatewayInfo ??
          (async () => parseGatewayInfo(await daemon.request(GATEWAY_INFO_METHOD, null))),
      }),
    ],
    HELP_GROUPS.system,
    output,
  );
  program.addHelpCommand(
    new Command("help [command]")
      .description("display help for command")
      .helpGroup(HELP_GROUPS.system),
  );
  return program;
}

function defaultResourceManifestPath(): string {
  return createRequire(import.meta.url).resolve("@univerjs-pro/cli-assets/manifest.json");
}

function defaultApplicationPackageRoot(): string {
  return fileURLToPath(new URL("../", import.meta.url));
}

function defaultSkillAssetRoot(): string {
  return fileURLToPath(new URL("./skills/", import.meta.url));
}

function defaultBrowserRuntimeRoot(): string {
  const entry = import.meta.url.endsWith("/dist/bin.js")
    ? new URL("./browser/", import.meta.url)
    : new URL("../../../packages/render-runtime-client/dist/", import.meta.url);
  return fileURLToPath(entry);
}

function defaultDaemonEntry(): URL {
  const configured = process.env["UNIVER_CLI_DAEMON_ENTRY"]?.trim();
  if (configured) return new URL(configured);
  if (import.meta.url.endsWith("/dist/bin.js")) {
    return new URL("./daemon.js", import.meta.url);
  }
  return new URL("../dist/daemon.js", import.meta.url);
}

function addCommands(
  program: Command,
  commands: readonly Command[],
  helpGroup: string,
  output: OutputConfiguration,
): void {
  for (const command of commands) addCommand(program, command.helpGroup(helpGroup), output);
}

function addCommand(program: Command, command: Command, output: OutputConfiguration): void {
  configureOutput(command, output);
  program.addCommand(command);
}

function configureOutput(command: Command, output: OutputConfiguration): void {
  command.configureOutput(output);
  for (const child of command.commands) configureOutput(child, output);
}
