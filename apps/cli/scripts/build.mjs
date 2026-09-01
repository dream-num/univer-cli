import { chmod, cp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { EXTERNAL_DEPENDENCY_WHITELIST, externalDependencyAudit } from "./release-dependencies.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
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
