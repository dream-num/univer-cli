import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
const html = await readFile(resolve(output, "index.html"), "utf8");
const cssPaths = [...html.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]);

if (cssPaths.length === 0) {
  throw new Error("collab-web build produced no linked CSS");
}

const css = (
  await Promise.all(
    cssPaths.map((file) => readFile(resolve(output, file.replace(/^\/+/, "")), "utf8"))
  )
).join("\n");
const fixedHeight = css.lastIndexOf(".univer-h-6{height:1.5rem}");
const fullHeight = css.lastIndexOf(".univer-h-full{height:100%}");

if (fixedHeight < 0 || fullHeight < 0 || fullHeight < fixedHeight) {
  throw new Error("collab-web CSS utility order would collapse full-height grid ribbon buttons");
}

console.log("Verified collab-web grid ribbon CSS utility order.");
