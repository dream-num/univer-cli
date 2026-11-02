import { existsSync, readFileSync, realpathSync } from "node:fs";
import { chmod, cp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { EXTERNAL_DEPENDENCY_WHITELIST, externalDependencyAudit } from "./release-dependencies.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(projectRoot);
const packageManifestPath = join(projectRoot, "package.json");
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
// Dual-format SDK packages ship lib/cjs and lib/es builds. One CJS-context require anywhere in
// the graph makes esbuild resolve the whole SDK through the require condition, inlining a second
// CommonJS copy of every engine next to the ESM copy the other entries share. Force every
// @univerjs-scoped bare import through the ESM condition so the graph stays single-instance.
const UNIVER_SDK_PACKAGE = /^@univerjs(?:-pro)?\/[^/]+$/u;

function pickEsmExport(entry) {
  if (typeof entry === "string") return entry;
  if (entry !== null && typeof entry === "object") {
    for (const condition of ["import", "node", "default"]) {
      if (entry[condition] !== undefined) return pickEsmExport(entry[condition]);
    }
  }
  return undefined;
}

function resolveEsmSdkPackage(specifier, importer) {
  const parts = specifier.split("/");
  const packageName = parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  // Resolve from the physical file location so dependency lookups land in the pnpm store
  // context that actually contains this importer's dependencies (symlink paths do not).
  let directory = dirname(realpathSync(importer));
  while (true) {
    const candidate = join(directory, "node_modules", packageName);
    if (existsSync(candidate)) {
      const packageRoot = realpathSync(candidate);
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
      } catch {
        return undefined;
      }
      if (manifest.exports === undefined) return undefined;
      const target = pickEsmExport(manifest.exports["."] ?? manifest.exports);
      return target === undefined ? undefined : join(packageRoot, target);
    }
    const parent = dirname(directory);
    if (parent === directory || directory === repositoryRoot) return undefined;
    directory = parent;
  }
}

const preferEsmSdkResolution = {
  name: "prefer-esm-univer-sdk-resolution",
  setup(context) {
    context.onResolve({ filter: /^@univerjs(?:-pro)?\// }, (args) => {
      if (!UNIVER_SDK_PACKAGE.test(args.path) || args.importer === "") return undefined;
      const resolved = resolveEsmSdkPackage(args.path, args.importer);
      // undefined falls through to esbuild's default resolution (deep imports, peers, etc.)
      return resolved === undefined ? undefined : { path: resolved };
    });
  },
};
const buildVersion = process.env["UNIVER_CLI_BUILD_VERSION"]?.trim();
const plugins = [
  preferEsmSdkResolution,
  ...(buildVersion === undefined || buildVersion.length === 0
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
      ]),
];

await rm(join(projectRoot, "dist"), { force: true, recursive: true });
// One build with code splitting: the SDK and other shared modules are emitted once into
// chunks/ and imported by every entry, instead of each entry inlining its own full copy.
const nodeBuild = await build({
  banner: nodeEsmBanner,
  bundle: true,
  entryPoints: {
    bin: join(projectRoot, "src", "bin.ts"),
    daemon: join(projectRoot, "src", "daemon-entry.ts"),
    "runtime-worker": join(projectRoot, "src", "runtime-worker.ts"),
  },
  external: EXTERNAL_DEPENDENCY_WHITELIST,
  format: "esm",
  legalComments: "none",
  metafile: true,
  minify: true,
  outdir: join(projectRoot, "dist"),
  chunkNames: "chunks/[name]-[hash]",
  entryNames: "[name]",
  platform: "node",
  plugins,
  splitting: true,
  sourcemap: false,
  target: "node22.12",
});
for (const entryName of ["bin", "daemon", "runtime-worker"]) {
  await chmod(join(projectRoot, "dist", `${entryName}.js`), 0o755);
}
await writeFile(
  join(projectRoot, "dist", "release-dependencies.json"),
  `${JSON.stringify(externalDependencyAudit([nodeBuild.metafile]), null, 2)}\n`,
  "utf8",
);
if (process.env["UNIVER_CLI_DUMP_METAFILE"] === "1") {
  await writeFile(
    join(projectRoot, "dist", "metafile.json"),
    `${JSON.stringify(nodeBuild.metafile)}\n`,
    "utf8",
  );
}
await cp(join(projectRoot, "src", "skills"), join(projectRoot, "dist", "skills"), {
  recursive: true,
});
// The collaboration pool spawns its worker bootstrap relative to its own module URL. Code
// splitting places the pool in a shared chunk under dist/chunks/, so the bootstrap file must
// ship there for the runtime URL resolution to find it.
const poolEntryPath = createRequire(import.meta.url).resolve(
  "@univer-cli/univer-collaboration-runtime-pool",
);
await cp(
  join(dirname(poolEntryPath), "worker-child.mjs"),
  join(projectRoot, "dist", "chunks", "worker-child.mjs"),
);
