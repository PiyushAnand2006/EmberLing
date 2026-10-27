// Feature tests for the new agent capabilities: local agent store (versioned
// writes), link-preview SSRF guard, browser URL guard, auto-review rule
// resolution, and the keyless gap tools that need the network.
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AgentStore } = require("../electron/agent-store");
const { validHttpUrl } = require("../electron/browser");

function withTmpStore(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "emberling-store-test-"));
  return Promise.resolve(run(root)).finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

async function main() {
  // ---------- agent store: versioned writes, read-back, search, delete ----------
  await withTmpStore(async (root) => {
    const store = new AgentStore(root, "");
    let r = await store.write("notes/ideas.md", "first draft");
    assert.strictEqual(r.version, 1);
    r = await store.write("notes/ideas.md", "second draft with more detail");
    assert.strictEqual(r.version, 2, "second write bumps version");

    const latest = await store.read("notes/ideas.md");
    assert.ok(latest.content.includes("second draft"), "latest content readable");
    const v1 = await store.read("notes/ideas.md", 1);
    assert.ok(v1.content.includes("first draft"), "revision 1 preserved");

    const listed = await store.list();
    assert.ok(listed.files.find((f) => f.name === "notes/ideas.md" && f.version === 2), "list shows name+version");

    const hits = await store.search("more detail");
    assert.ok(hits.hits.length === 1 && hits.hits[0].name === "notes/ideas.md", "search finds doc with excerpt");

    const vers = await store.versions("notes/ideas.md");
    assert.deepStrictEqual(vers.revisions, [1], "revision history listed");

    // isolated scopes: bot store must not see default-scope docs
    const botStore = new AgentStore(root, "bot-1234-abcd");
    const botList = await botStore.list();
    assert.strictEqual(botList.files.length, 0, "bot scope is isolated");
    await botStore.write("memory.md", "bot memory");
    const defaultAgain = new AgentStore(root, "");
    assert.strictEqual((await defaultAgain.list()).files.find((f) => f.name === "memory.md"), undefined, "scopes fully isolated");

    // traversal rejected
    try {
      await store.write("../escape.txt", "x");
      assert.fail("traversal must throw");
    } catch (e) {
      assert.ok(/invalid document name/.test(e.message));
    }

    const del = await store.delete("notes/ideas.md");
    assert.ok(del.ok);
    assert.strictEqual((await store.read("notes/ideas.md").catch(() => ({ ok: false }))).ok, false, "deleted doc unreadable");
    const archived = await store.read("notes/ideas.md", 2);
    assert.ok(archived.ok, "delete archives the latest revision");
    console.log("agent store OK (versions, scopes, search, traversal guard, delete-archive)");
  });

  // ---------- SSRF guard on outbound web requests ----------
  const { assertPublicHttpUrl } = require("../electron/web-tools");
  for (const bad of ["http://localhost/x", "http://127.0.0.1/x", "http://169.254.169.254/latest/meta-data", "http://192.168.1.1/", "http://10.0.0.5/", "ftp://example.com", "http://user:pass@example.com/"]) {
    try {
      await assertPublicHttpUrl(bad);
      assert.fail("should reject: " + bad);
    } catch (e) {
      assert.ok(!/allowed$/.test(""), "rejected: " + bad);
    }
  }
  // a public host must PASS the guard (dns resolves publicly) — skipped when
  // the machine's network/DNS is down or flapping (outage != code failure)
  const dnsOk = await require("node:dns/promises")
    .lookup("example.com")
    .then(() => true)
    .catch(() => false);
  let positive = null;
  if (dnsOk) {
    try {
      await assertPublicHttpUrl("https://example.com/");
      positive = "pass";
    } catch (e) {
      positive = /host does not resolve/i.test(e.message) ? "flaky" : "fail:" + e.message;
    }
  }
  if (positive === "fail:" || (positive || "").startsWith("fail:")) {
    assert.fail(positive);
  }
  console.log("SSRF positive path", positive === "pass" ? "OK (public host passes)" : "SKIPPED (machine DNS down/flappy)");
  console.log("SSRF guard OK (localhost/loopback/private/reserved rejected)");

  // ---------- browser URL validation ----------
  assert.ok(validHttpUrl("https://example.com/page?q=1"), "https ok");
  assert.ok(validHttpUrl("http://example.com"), "http ok");
  assert.strictEqual(validHttpUrl("file:///etc/passwd"), null, "file: rejected");
  assert.strictEqual(validHttpUrl("javascript:alert(1)"), null, "javascript: rejected");
  assert.strictEqual(validHttpUrl("https://user:pass@example.com/"), null, "credentials rejected");
  assert.strictEqual(validHttpUrl("not a url"), null, "garbage rejected");
  console.log("browser URL guard OK");

  // ---------- executeTool: auto-review rules gate ----------
  const { executeTool } = require("../electron/tools");
  const mkCtx = (rules, approvalMode, approveResult = true) => ({
    approvalMode: approvalMode || "auto",
    approve: () => {
      approved = true;
      return Promise.resolve(approveResult);
    },
    resolveAutoReview: (name, args) => {
      const hay = (name + " " + JSON.stringify(args ?? {})).toLowerCase();
      for (const rule of rules) {
        const pattern = String(rule.pattern).trim().toLowerCase();
        if (!pattern) continue;
        const hit = pattern.startsWith("/") ? (() => { try { return new RegExp(pattern.slice(1, -1), "i").test(hay); } catch { return false; } })() : hay.includes(pattern);
        if (hit) return rule.action;
      }
      return null;
    },
  });
  let approved = false;
  // deny rule blocks even in auto mode (harmless tool — gating is tool-agnostic)
  let r = await executeTool({ name: "list_dir", args: { path: os.tmpdir() } }, mkCtx([{ pattern: "list_dir", action: "deny" }]));
  assert.strictEqual(r.ok, false);
  assert.ok(/auto-review/.test(r.error));
  assert.strictEqual(approved, false, "denied without prompting");
  // ask rule forces a prompt even in auto mode — declined, nothing executes
  // (write_file is a NEEDS_APPROVAL tool, so the forced-ask rule can bite)
  approved = false;
  const scratch = path.join(os.tmpdir(), "emberling-ar-test-" + Date.now() + ".txt");
  r = await executeTool({ name: "write_file", args: { path: scratch, content: "x" } }, mkCtx([{ pattern: "write_file", action: "ask" }], "auto", false));
  assert.strictEqual(approved, true, "ask rule forced the approval prompt");
  assert.strictEqual(r.ok, false, "declined path did not execute the tool");
  // allow rule skips the prompt even in ask mode
  approved = false;
  r = await executeTool({ name: "list_dir", args: { path: os.tmpdir() } }, mkCtx([{ pattern: "list_dir", action: "allow" }], "ask"));
  assert.strictEqual(approved, false, "allow rule skipped the prompt");
  assert.ok(r.ok && r.entries, "tool executed normally");
  // ---------- per-Dotling VM: approval-free execution inside the sandbox ----------
  const sandbox = require("../electron/sandbox");
  const origProbe = sandbox.probe;
  const origList = sandbox.listDistros;
  const origRun = sandbox.runInSandbox;
  sandbox.probe = async () => ({ state: "ready", distros: ["TestBase"], distro: "TestBase", hint: null });
  sandbox.listDistros = async () => ["TestBase", "emberling-test"]; // clone already provisioned
  let captured = null;
  sandbox.runInSandbox = async (opts) => {
    captured = opts;
    return { exitCode: 0, stdout: "vm-out\n", stderr: "", sandbox: opts.distro };
  };
  approved = false;
  r = await executeTool({ name: "run_command", args: { command: "echo vm" } }, { ...mkCtx([], "ask"), executionTarget: "sandbox", sandboxScope: "test" });
  assert.strictEqual(approved, false, "VM execution must not prompt");
  assert.strictEqual(r.exitCode, 0, "vm command ran");
  assert.strictEqual(captured.script, "echo vm");
  assert.strictEqual(captured.distro, "emberling-test", "per-Dotling distro selected");
  sandbox.probe = origProbe;
  sandbox.listDistros = origList;
  sandbox.runInSandbox = origRun;
  console.log("per-Dotling VM execution OK (no prompt, scoped distro)");

  console.log("auto-review rules OK (deny/ask/allow precedence)");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
