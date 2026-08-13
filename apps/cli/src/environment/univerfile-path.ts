import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveLocalUniverfile(input: string, cwd = process.cwd()): string {
  const value = input.trim();
  if (value.length === 0) throw inputError("A .univer file path is required");

  let path: string;
  if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw inputError(`Invalid Univerfile locator: ${input}`);
    }
    if (url.protocol !== "file:") {
      throw inputError(`Univerfile must be a local path or file: URL: ${input}`);
    }
    if (url.search.length > 0 || url.hash.length > 0) {
      throw inputError(`Univerfile file: URL cannot contain query or fragment: ${input}`);
    }
    path = fileURLToPath(url);
  } else {
    path = resolve(cwd, value);
  }

  if (extname(path).toLowerCase() !== ".univer") {
    throw inputError(`Univerfile path must end in .univer: ${input}`);
  }
  return resolve(path);
}

function inputError(message: string): Error {
  return Object.assign(new Error(message), { code: "UNIVERFILE_INPUT_INVALID" });
}
