// Direct test of the local tool surface: run_command, file tools, and the
// shell runner — the "task execution" side of the agent.
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { executeTool, toolsRequiringApproval } = require("../electron/tools");

const ctx = {
  approvalMode: "auto",
  approve: () => Promise.resolve(true),
  signal: undefined,
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "emberling-tooltest-"));

async function main() {
  // 1. run_command — PowerShell pipeline
  let r = await executeTool({ name: "run_command", args: { command: "Write-Output ('2+2=' + (2+2))" } }, ctx);
  console.log("run_command:", JSON.stringify(r));
  assert.strictEqual(r.exitCode, 0);
  assert.ok(r.stdout.includes("2+2=4"));

  // 2. run_command — cwd respected
  r = await executeTool({ name: "run_command", args: { command: "(Get-Location).Path", cwd: tmp } }, ctx);
  assert.ok(r.stdout.includes(path.basename(tmp)), "cwd should be honored");

  // 3. write_file + read_file + edit_file + list_dir round trip
  const f = path.join(tmp, "note.txt");
  r = await executeTool({ name: "write_file", args: { path: f, content: "hello world" } }, ctx);
  assert.ok(r.ok, "write_file: " + JSON.stringify(r));
  r = await executeTool({ name: "read_file", args: { path: f } }, ctx);
  assert.ok(r.content.includes("hello world"));
  r = await executeTool({ name: "edit_file", args: { path: f, old_text: "hello", new_text: "goodbye" } }, ctx);
  assert.ok(r.ok, "edit_file: " + JSON.stringify(r));
  r = await executeTool({ name: "list_dir", args: { path: tmp } }, ctx);
  assert.ok(r.entries.includes("note.txt"));

  // 4. run_command reading the file it just wrote (agent-style chaining)
  r = await executeTool({ name: "run_command", args: { command: `Get-Content "${f}"` } }, ctx);
  assert.ok(r.stdout.includes("goodbye"));

  // 5. list_windows (PowerShell Win32)
  r = await executeTool({ name: "list_windows", args: {} }, ctx);
  console.log("list_windows ok:", r.ok, "count:", (r.windows || []).length);

  // 6. arg guards: empty command, relative read
  r = await executeTool({ name: "run_command", args: {} }, ctx);
  console.log("empty command ->", JSON.stringify(r));
  r = await executeTool({ name: "read_file", args: { path: "definitely-missing-file-xyz.txt" } }, ctx);
  console.log("missing file ->", JSON.stringify(r).slice(0, 140));

  // 7. approval gating flags
  console.log("needs approval:", [...["run_command", "read_file", "write_file"]].filter(toolsRequiringApproval));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("ALL DIRECT TOOL TESTS PASSED");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
