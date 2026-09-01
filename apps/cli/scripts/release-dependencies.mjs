import { isBuiltin } from "node:module";

// The published dependency contract: every package in this list ships as a real runtime
// dependency of the release artifact; EVERYTHING else the bundles import must be inlined.
// A dependency earns its place here only because it cannot be inlined — the reason is
// documented on its entry. Extend this list only with that justification.
export const EXTERNAL_DEPENDENCY_WHITELIST = [
  // Native bindings: esbuild cannot inline their per-platform binaries, which the packages
  // resolve for the running platform at runtime.
  "@univerjs-pro/doc-typst-native-binding",
  "@univerjs-pro/engine-formula-rust-binding",
  "@univerjs-pro/exchange-node-binding",
  // Static asset package resolved dynamically at runtime, so the bundler never sees the import.
  "@univerjs-pro/cli-assets",
  // Resolve, download, and spawn browser executables and helper scripts relative to their own
  // package directory; inlining breaks that file layout.
  "@puppeteer/browsers",
  "puppeteer-core",
  // Loaded at runtime as a whole package: its dynamic requires and lib layout must stay on disk.
  "typescript",
  // Keeps optional native accelerators (bufferutil, utf-8-validate) that must remain real
  // installable packages resolved from its own node_modules.
  "ws",
  // Native SQLite driver with platform binaries.
  "libsql",
];

// Audits the esbuild metafiles against the whitelist. Every non-builtin external import must be
// whitelisted — the gate fails the build otherwise, so an unlisted package can never silently
// become a published runtime dependency.
export function externalDependencyAudit(metafiles) {
  const required = new Set(EXTERNAL_DEPENDENCY_WHITELIST);
  const conditional = new Set();
  for (const metafile of metafiles) {
    for (const output of Object.values(metafile.outputs)) {
      for (const dependency of output.imports) {
        if (dependency.external !== true || isBuiltin(dependency.path)) continue;
        const name = packageName(dependency.path);
        if (name === undefined) continue;
        if (!required.has(name)) {
          throw new Error(
            `External dependency ${name} is not on the release whitelist. Inline it into the bundle, or add it to EXTERNAL_DEPENDENCY_WHITELIST in apps/cli/scripts/release-dependencies.mjs with a documented reason why it cannot be inlined.`,
          );
        }
        if (dependency.kind !== "import-statement") conditional.add(name);
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
