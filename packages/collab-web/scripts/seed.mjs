// Seed a demo .univer on a running ucb server so the browser viewer has content:
// 3 trunk files (2 sheets + 1 doc), one "等待确认" worktree (ready),
// and one "正在进行" worktree (open). Also doubles as a server-connected smoke test.
//
// Usage: node scripts/seed.mjs            (server at http://127.0.0.1:8000, file /tmp/ucb-demo.univer)

const ORIGIN = process.env.UCB_SERVER ?? "http://127.0.0.1:8000";
const FILE = process.env.UCB_FILE ?? "/tmp/ucb-demo.univer";
const enc = Buffer.from(FILE).toString("base64url");
const UF = `${ORIGIN}/uf/${enc}`;

async function jpost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  if (!r.ok) throw new Error(`POST ${url} -> HTTP ${r.status}`);
  return r.json();
}
async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> HTTP ${r.status}`);
  return r.json();
}

// Univerfiles are no longer lazily created: `POST /uf/<enc>` is the only endpoint that creates
// the `.univer`. Run this before any other call. Tolerate 409 (UniverfileExistsError) so re-running
// the seed against an existing file is idempotent; surface any other failure.
async function ensureUniverfile() {
  const r = await fetch(UF, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  if (r.ok) {
    console.log("  + univerfile 已创建");
    return;
  }
  if (r.status === 409) {
    console.log("  · univerfile 已存在,复用");
    return;
  }
  throw new Error(`create univerfile ${UF} -> HTTP ${r.status}`);
}

async function createUnit(type, name) {
  const res = await jpost(`${UF}/universer-api/snapshot/${type}/unit/-/create`, { type, name });
  if (res.error?.code !== 1) throw new Error(`create ${name}: ${res.error?.message}`);
  console.log(`  + 文件 ${name} (type=${type}) -> ${res.unitID}`);
  return res.unitID;
}

async function main() {
  console.log(`seeding ${FILE}`);
  console.log(`  enc=${enc}`);

  console.log("univerfile:");
  await ensureUniverfile();

  console.log("trunk 文件:");
  await createUnit(2, "销售明细");
  await createUnit(2, "渠道汇总");
  await createUnit(1, "分析说明");

  console.log("等待确认的修改 (ready worktree):");
  const fa = await jpost(`${UF}/worktrees`, { agentId: "A1", name: "销售归因重算" });
  console.log(`  worktreeId=${fa.worktreeId}`);
  const ready = await jpost(`${UF}/worktrees/${fa.worktreeId}/ready`, {});
  console.log(`  ready status=${ready.status}`);

  console.log("正在进行的修改 (open worktree):");
  const fb = await jpost(`${UF}/worktrees`, { agentId: "A2", name: "成本表重构" });
  console.log(`  worktreeId=${fb.worktreeId}`);

  // Verify reads the browser will do.
  const units = await jget(`${UF}/units`);
  const worktrees = await jget(`${UF}/worktrees`);
  const worktreeUnits = await jget(`${UF}/worktrees/${fa.worktreeId}/units`);
  console.log("verify:");
  console.log(`  trunk units = ${units.units.map((u) => u.name).join(", ")}`);
  console.log(
    `  worktrees = ${worktrees.worktrees.map((f) => `${f.name}[${f.status}]`).join(", ")}`
  );
  console.log(`  ready-worktree units = ${worktreeUnits.units.map((u) => u.name).join(", ")}`);

  console.log(`\nopen the viewer at:  http://localhost:5180/?file=${encodeURIComponent(FILE)}`);
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
