#!/usr/bin/env node

/**
 * Fetch every page of an agent-ready, pinned Unit comparison.
 *
 * The example deliberately uses only Node's built-in `fetch`, so an agent can copy or execute it
 * without compiling this workspace. Run with `--help` for the complete command line.
 */

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

for (const required of ["file", "right-worktree", "unit"]) {
  if (!options[required]) fail(`Missing --${required}. Run with --help for an example.`);
}

const origin = options.origin ?? "http://127.0.0.1:8000";
const fileKey = Buffer.from(options.file).toString("base64url");
const rightWorktreeId = options["right-worktree"];
const unitId = options.unit;
const comparisonRequest = options["left-worktree"]
  ? { left: { kind: "worktree", worktreeId: options["left-worktree"] } }
  : {};
const comparison = await requestJson(
  `${origin}/uf/${fileKey}/worktrees/${encodeURIComponent(rightWorktreeId)}/comparisons`,
  { method: "POST", body: JSON.stringify(comparisonRequest) },
);
assertBusinessSuccess(comparison, "create comparison");

const detail = options.detail ?? "changes";
const limit = positiveInteger(options["page-size"] ?? "100", "--page-size");
const items = [];
let offset = 0;
let contextOffset = 0;
const alignmentRows = [];
let contextHasMore = false;
let context;
do {
  const query = new URLSearchParams({
    detail,
    limit: String(limit),
    offset: String(offset),
    contextOffset: String(contextOffset),
    contextLimit: "1000",
  });
  appendCsv(query, "kind", options.kind);
  appendCsv(query, "entityType", options["entity-type"]);
  appendOptional(query, "parentStableId", options.parent);
  appendOptional(query, "search", options.search);
  const page = await requestJson(
    `${origin}/uf/${fileKey}/worktrees/${encodeURIComponent(rightWorktreeId)}/comparisons/${encodeURIComponent(comparison.comparisonId)}/units/${encodeURIComponent(unitId)}/diff?${query}`,
  );
  assertBusinessSuccess(page, "query comparison context");
  if (!page.context) fail("Gateway returned success without context.");
  context = page.context;
  items.push(...context.items);
  offset += context.items.length;
  const alignment =
    context.productContext?.kind === "doc" ? context.productContext.paragraphAlignment : undefined;
  contextHasMore = alignment?.page?.hasMore ?? false;
  if (alignment !== undefined) {
    alignmentRows.push(...alignment.rows);
    contextOffset += alignment.rows.length;
    if (contextHasMore && alignment.rows.length === 0)
      fail("Gateway reported another alignment page without rows.");
  }
  if (context.page.hasMore && context.items.length === 0) {
    fail("Gateway reported another page without returning items.");
  }
} while (context.page.hasMore || contextHasMore);

// Keep the output identical to the HTTP contract, except that pagination is flattened for agents.
process.stdout.write(
  `${JSON.stringify(
    {
      ...context,
      page: { offset: 0, limit: items.length, matched: context.page.matched, hasMore: false },
      items,
      ...(context.productContext?.kind === "doc"
        ? {
            productContext: {
              ...context.productContext,
              paragraphAlignment: {
                ...context.productContext.paragraphAlignment,
                rows: alignmentRows,
                page: {
                  offset: 0,
                  limit: alignmentRows.length,
                  matched: alignmentRows.length,
                  hasMore: false,
                },
              },
            },
          }
        : {}),
    },
    null,
    2,
  )}\n`,
);

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--help" || token === "-h") {
      result.help = true;
      continue;
    }
    if (!token.startsWith("--")) fail(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${token}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function appendCsv(query, key, value) {
  if (value) query.set(key, value);
}

function appendOptional(query, key, value) {
  if (value) query.set(key, value);
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${label} must be a positive integer.`);
  return parsed;
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...init.headers },
  });
  const body = await response.json();
  if (!response.ok) fail(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  return body;
}

function assertBusinessSuccess(body, operation) {
  if (body?.error?.code !== 1) {
    fail(`${operation} failed: ${body?.error?.message ?? JSON.stringify(body)}`);
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printHelp() {
  process.stdout.write(`Usage:
  node examples/agent-diff-context.mjs \\
    --file /absolute/path/book.univer \\
    --right-worktree wt-current \\
    --unit unit-id \\
    [--left-worktree wt-base] \\
    [--detail summary|changes|full] \\
    [--kind insert,delete,update] \\
    [--entity-type paragraph,table] \\
    [--parent stable-parent-id] \\
    [--search text] \\
    [--page-size 100] \\
    [--origin http://127.0.0.1:8000]

Without --left-worktree, the left side is Trunk. The comparison pins both heads before paging.
Use detail=changes for agent-readable before/after values without returning full raw entities.
`);
}
