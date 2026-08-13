import type { JsonValue } from "@univer-cli/daemon";

export function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export function invalidResult(message: string): Error {
  return codedError("DAEMON_RESULT_INVALID", message);
}

export function requireRecord(
  value: JsonValue | undefined,
  label: string,
): Readonly<Record<string, JsonValue>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw codedError("DAEMON_RESULT_INVALID", `${label} must be an object`);
  }
  return value;
}

export function requireString(
  value: JsonValue | undefined,
  label: string,
  allowEmpty = false,
): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw codedError("DAEMON_RESULT_INVALID", `${label} is invalid`);
  }
  return value;
}

export function optionalString(
  value: JsonValue | undefined,
  label: string,
  allowEmpty = false,
): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, label, allowEmpty);
}
