import { chmod, cp, readFile, rm, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageManifestPath = join(projectRoot, "package.json");
const outputPath = join(projectRoot, "dist", "bin.js");
const daemonOutputPath = join(projectRoot, "dist", "daemon.js");
const runtimeWorkerOutputPath = join(projectRoot, "dist", "runtime-worker.js");
const nodeEsmRequireBanner = {
  js: [
    'import { createRequire as __createRequire } from "node:module";',
    "const require = __createRequire(import.meta.url);",
  ].join("\n"),
};
const nodeEsmBanner = {
  js: [
    'import { createRequire as __createRequire } from "node:module";',
    'import { dirname as __pathDirname } from "node:path";',
    'import { fileURLToPath as __fileURLToPath } from "node:url";',
    "const require = __createRequire(import.meta.url);",
    "const __filename = __fileURLToPath(import.meta.url);",
    "const __dirname = __pathDirname(__filename);",
  ].join("\n"),
};
const buildVersion = process.env["UNIVER_CLI_BUILD_VERSION"]?.trim();
const plugins =
  buildVersion === undefined || buildVersion.length === 0
    ? []
    : [
        {
          name: "univer-cli-build-version",
          setup(context) {
            context.onLoad({ filter: /package\.json$/ }, async (args) => {
              if (args.path !== packageManifestPath) return undefined;
              const manifest = JSON.parse(await readFile(packageManifestPath, "utf8"));
              return {
                contents: JSON.stringify({ ...manifest, version: buildVersion }),
                loader: "json",
              };
            });
          },
        },
      ];

await rm(join(projectRoot, "dist"), { force: true, recursive: true });
const binBuild = await build({
  banner: nodeEsmRequireBanner,
  bundle: true,
  entryPoints: [join(projectRoot, "src", "bin.ts")],
  external: ["@univer-cli/doc-typst-facade"],
  format: "esm",
  legalComments: "none",
  metafile: true,
  outfile: outputPath,
  platform: "node",
  plugins,
  sourcemap: true,
  target: "node22.12",
});
await chmod(outputPath, 0o755);
const daemonBuild = await build({
  banner: nodeEsmBanner,
  bundle: true,
  entryPoints: [join(projectRoot, "src", "daemon-entry.ts")],
  external: ["@univer-cli/univer-collaboration-runtime-pool", "busboy", "libsql"],
  format: "esm",
  legalComments: "none",
  metafile: true,
  outfile: daemonOutputPath,
  platform: "node",
  plugins,
  sourcemap: true,
  target: "node22.12",
});
await chmod(daemonOutputPath, 0o755);
const runtimeWorkerBuild = await build({
  banner: nodeEsmBanner,
  bundle: true,
  entryPoints: [join(projectRoot, "src", "runtime-worker.ts")],
  format: "esm",
  legalComments: "none",
  metafile: true,
  outfile: runtimeWorkerOutputPath,
  packages: "external",
  platform: "node",
  plugins,
  sourcemap: true,
  target: "node22.12",
});
await chmod(runtimeWorkerOutputPath, 0o755);
await writeFile(
  join(projectRoot, "dist", "release-dependencies.json"),
  `${JSON.stringify(
    externalDependencyAudit([binBuild.metafile, daemonBuild.metafile, runtimeWorkerBuild.metafile]),
    null,
    2,
  )}\n`,
  "utf8",
);
await cp(join(projectRoot, "src", "skills"), join(projectRoot, "dist", "skills"), {
  recursive: true,
});

function externalDependencyAudit(metafiles) {
  // These application adapters resolve their platform packages dynamically at runtime, so esbuild's
  // metafile cannot see them. Keep them in the release audit rather than repairing downstream images.
  const required = new Set([
    "@univerjs-pro/cli-assets",
    "@univerjs-pro/engine-formula-rust-binding",
    "@univerjs-pro/uexcli",
  ]);
  const conditional = new Set();
  for (const metafile of metafiles) {
    for (const output of Object.values(metafile.outputs)) {
      for (const dependency of output.imports) {
        if (dependency.external !== true || isBuiltin(dependency.path)) continue;
        const name = packageName(dependency.path);
        if (name === undefined) continue;
        if (dependency.kind === "import-statement") required.add(name);
        else conditional.add(name);
      }
    }
  }
  return { conditional: [...conditional].sort(), required: [...required].sort() };
}

function packageName(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return undefined;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
