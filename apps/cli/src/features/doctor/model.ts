export interface DoctorCheckOutput {
  readonly details?: Readonly<Record<string, unknown>>;
  readonly message?: string;
  readonly ok: boolean;
}

export interface DoctorCheck {
  readonly name: string;
  run(): Promise<DoctorCheckOutput>;
}

export interface DoctorCheckResult extends DoctorCheckOutput {
  readonly name: string;
}

export interface DoctorReport {
  readonly checks: readonly DoctorCheckResult[];
  readonly ok: boolean;
}

export interface DoctorCollectInput {
  readonly all?: boolean;
  readonly last?: string;
  readonly output?: string;
  readonly since?: string;
  readonly traceId?: string;
}

export interface DoctorCollectionScope {
  readonly all: boolean;
  readonly createdAt: string;
  readonly defaultWindow: boolean;
  readonly last?: string;
  readonly output?: string;
  readonly since?: string;
  readonly traceId?: string;
}

export interface DoctorCollectionResult {
  readonly files: readonly string[];
  readonly outputPath: string;
  readonly summary?: Readonly<Record<string, unknown>>;
  readonly warnings: readonly string[];
}

export interface Doctor {
  check(): Promise<DoctorReport>;
  collect(input?: DoctorCollectInput): Promise<DoctorCollectionResult>;
}

export interface CreateDoctorOptions {
  readonly checks: readonly DoctorCheck[];
  readonly collector?: {
    collect(scope: DoctorCollectionScope): Promise<DoctorCollectionResult>;
  };
  readonly defaultLast?: string;
  readonly now?: () => Date;
}

export type DoctorErrorCode =
  | "DOCTOR_COLLECTOR_UNAVAILABLE"
  | "DOCTOR_INVALID_CHECK"
  | "DOCTOR_INVALID_COLLECT_SCOPE";

export class DoctorError extends Error {
  public readonly code: DoctorErrorCode;

  public constructor(code: DoctorErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DoctorError";
    this.code = code;
  }
}

const DEFAULT_LAST = "2h";

export function createDoctor(options: CreateDoctorOptions): Doctor {
  const checks = validateChecks(options.checks);
  const defaultLast = validateDuration(options.defaultLast ?? DEFAULT_LAST, "defaultLast");
  const now = options.now ?? (() => new Date());

  return {
    async check() {
      const results = await Promise.all(checks.map(async (check) => await runCheck(check)));
      return { checks: results, ok: results.every((result) => result.ok) };
    },
    async collect(input = {}) {
      if (options.collector === undefined) {
        throw new DoctorError(
          "DOCTOR_COLLECTOR_UNAVAILABLE",
          "Diagnostic collection is not configured for this application.",
        );
      }
      return await options.collector.collect(resolveCollectionScope(input, defaultLast, now()));
    },
  };
}

function validateChecks(checks: readonly DoctorCheck[]): readonly DoctorCheck[] {
  const names = new Set<string>();
  for (const check of checks) {
    const name = check.name.trim();
    if (name.length === 0) invalidCheck("Doctor check names cannot be empty.");
    if (names.has(name)) invalidCheck(`Doctor check names must be unique: ${name}.`);
    names.add(name);
  }
  return [...checks];
}

async function runCheck(check: DoctorCheck): Promise<DoctorCheckResult> {
  try {
    return { name: check.name, ...(await check.run()) };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      name: check.name,
      ok: false,
    };
  }
}

function resolveCollectionScope(
  input: DoctorCollectInput,
  defaultLast: string,
  now: Date,
): DoctorCollectionScope {
  const createdAt = validDate(now, "The doctor clock returned an invalid date.").toISOString();
  const all = input.all === true;
  const last = optionalTrimmed(input.last, "last");
  const since = optionalTrimmed(input.since, "since");
  const traceId = optionalTrimmed(input.traceId, "traceId");
  const output = optionalTrimmed(input.output, "output");

  if (all && (last !== undefined || since !== undefined)) {
    invalidScope("all cannot be combined with last or since.");
  }
  if (last !== undefined && since !== undefined) invalidScope("last and since cannot be combined.");
  if (all) {
    return {
      all: true,
      createdAt,
      defaultWindow: false,
      ...(output === undefined ? {} : { output }),
      ...(traceId === undefined ? {} : { traceId }),
    };
  }
  if (since !== undefined) {
    return {
      all: false,
      createdAt,
      defaultWindow: false,
      ...(output === undefined ? {} : { output }),
      since: validDate(new Date(since), "since must be an ISO timestamp.").toISOString(),
      ...(traceId === undefined ? {} : { traceId }),
    };
  }
  if (traceId !== undefined && last === undefined) {
    return {
      all: false,
      createdAt,
      defaultWindow: false,
      ...(output === undefined ? {} : { output }),
      traceId,
    };
  }

  const resolvedLast = validateDuration(last ?? defaultLast, "last");
  return {
    all: false,
    createdAt,
    defaultWindow: last === undefined,
    last: resolvedLast,
    ...(output === undefined ? {} : { output }),
    since: new Date(now.getTime() - durationMilliseconds(resolvedLast)).toISOString(),
    ...(traceId === undefined ? {} : { traceId }),
  };
}

function validateDuration(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^\d+(m|h|d)$/u.test(normalized) || durationMilliseconds(normalized) <= 0) {
    invalidScope(`${field} must be a positive duration such as 30m, 2h, or 1d.`);
  }
  return normalized;
}

function durationMilliseconds(value: string): number {
  const match = /^(\d+)(m|h|d)$/u.exec(value);
  if (match === null) return 0;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount)) return 0;
  const multiplier = match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000;
  const duration = amount * multiplier;
  return Number.isSafeInteger(duration) ? duration : 0;
}

function optionalTrimmed(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) invalidScope(`${field} cannot be empty.`);
  return normalized;
}

function validDate(value: Date, message: string): Date {
  if (Number.isNaN(value.getTime())) invalidScope(message);
  return value;
}

function invalidCheck(message: string): never {
  throw new DoctorError("DOCTOR_INVALID_CHECK", message);
}

function invalidScope(message: string): never {
  throw new DoctorError("DOCTOR_INVALID_COLLECT_SCOPE", message);
}
