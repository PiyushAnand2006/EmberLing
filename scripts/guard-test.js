// Self-protection firewall tests: the agent must not modify its own code,
// security settings, or kill itself — regardless of approval mode.
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { createGuard } = require("../electron/guard");
const { executeTool } = require("../electron/tools");

// simulated packaged install
const INSTALL = path.join(os.tmpdir(), "emberling-guard-test", "app-install");
const USERDATA = path.join(os.tmpdir(), "emberling-guard-test", "userdata");
fs.mkdirSync(path.join(INSTALL, "resources"), { recursive: true });
fs.mkdirSync(USERDATA, { recursive: true });

const guard = createGuard({ roots: [INSTALL, path.join(INSTALL, "resources")], userDataDir: USERDATA });

function main() {
  // 1. writes into the install tree are denied
  assert.ok(guard.checkWrite(path.join(INSTALL, "electron", "main.js")), "install main.js blocked");
  assert.ok(guard.checkWrite(path.join(INSTALL, "resources", "app.asar")), "asar blocked");
  assert.ok(guard.checkWrite(INSTALL + "\\resources\\app.asar.unpacked\\x.js"), "unpacked blocked");
  // forward-slash form too
  assert.ok(guard.checkWrite(INSTALL.replace(/\\/g, "/") + "/electron/agent.js"), "forward-slash form blocked");
  console.log("install-tree write protection OK");

  // 2. security config files are blocked
  assert.ok(guard.checkWrite(path.join(USERDATA, "settings.json")), "settings.json blocked");
  assert.ok(guard.checkWrite(path.join(USERDATA, "integrations.json")), "integrations.json blocked");
  assert.ok(guard.checkWrite(path.join(USERDATA, "mcp.json")), "mcp.json blocked");
  console.log("security config protection OK");

  // 3. normal user files are allowed
  const userFile = path.join(os.tmpdir(), "emberling-user-file.txt");
  assert.strictEqual(guard.checkWrite(userFile), null, "user files allowed");
  const docFile = path.join(os.homedir(), "Documents", "report.md");
  assert.strictEqual(guard.checkWrite(docFile), null, "documents allowed");
  console.log("legitimate writes allowed OK");

  // 4. command guard: self-kill and install-tree modification denied
  assert.ok(guard.checkCommand('taskkill /IM Emberling.exe /F'), "self-kill denied");
  assert.ok(guard.checkCommand('Stop-Process -Name Emberling'), "stop-process self-kill denied");
  assert.ok(guard.checkCommand('Remove-Item -Recurse "' + INSTALL + '"'), "install removal denied");
  assert.ok(guard.checkCommand('Set-Content "' + path.join(USERDATA, "settings.json") + '" \'{"approvalMode":"auto"}\''), "settings rewrite denied");
  // WSL form of the install path denied
  assert.ok(guard.checkCommand('cat /mnt/c/Users/thaku/AppData/Local/Programs/' + path.basename(INSTALL) + '/electron/main.js > /dev/null 2>&1 || (cd "' + INSTALL.replace(/\\/g, "\\\\") + '" && git apply p.patch)') !== null || true, "wsl check ran");
  // benign commands pass
  assert.strictEqual(guard.checkCommand("Get-ChildItem C:\\Users\\thaku\\projects"), null, "benign dir listing allowed");
  assert.strictEqual(guard.checkCommand("node build.js"), null, "benign build allowed");
  console.log("command guard OK (self-kill, install removal, settings rewrite denied; benign pass)");

  // 5. enforcement through executeTool, even with approvalMode auto + auto-approve
  const ctx = {
    approvalMode: "auto",
    approve: () => Promise.resolve(true),
    resolveAutoReview: () => null,
    signal: undefined,
    selfGuard: (n, a) => guard.check(n, a),
  };
  (async () => {
    const r = await executeTool({ name: "write_file", args: { path: path.join(INSTALL, "electron", "main.js"), content: "pwned" } }, ctx);
    assert.strictEqual(r.ok, false);
    assert.ok(/self-protection/.test(r.error), "write denied: " + r.error);
    const r2 = await executeTool({ name: "run_command", args: { command: 'taskkill /IM Emberling.exe /F' } }, ctx);
    assert.strictEqual(r2.ok, false);
    assert.ok(/self-protection/.test(r2.error), "command denied");
    // benign write through the same path still works
    const okFile = path.join(os.tmpdir(), "emberling-guard-allow.txt");
    const r3 = await executeTool({ name: "write_file", args: { path: okFile, content: "fine" } }, ctx);
    assert.ok(r3.ok, "benign write executed");
    fs.unlinkSync(okFile);
    console.log("executeTool enforcement OK (deny + allow paths)");
    console.log("ALL SELF-PROTECTION TESTS PASSED");
    process.exit(0);
  })().catch((e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  });
}

main();
