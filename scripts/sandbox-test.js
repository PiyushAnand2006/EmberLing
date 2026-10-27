// Sandbox module tests: pure functions + (if WSL present) live probe/exec.
const assert = require("node:assert");
const sandbox = require("../electron/sandbox");

function main() {
  // path translation
  assert.strictEqual(sandbox.winToWslPath("C:\\Users\\thaku\\Temp\\f.txt"), "/mnt/c/Users/thaku/Temp/f.txt");
  assert.strictEqual(sandbox.winToWslPath("D:\\data"), "/mnt/d/data");
  assert.strictEqual(sandbox.winToWslPath("/home/u/f"), "/home/u/f", "non-Windows paths untouched");
  assert.strictEqual(sandbox.wslToWinPath("/mnt/c/Users/thaku/Temp/f.txt"), "C:\\Users\\thaku\\Temp\\f.txt");
  assert.strictEqual(sandbox.wslToWinPath("/mnt/d"), "D:\\");
  assert.strictEqual(sandbox.wslToWinPath("/home/u"), "/home/u");
  assert.strictEqual(sandbox.isWinAbsPath("C:\\x\\y"), true);
  assert.strictEqual(sandbox.isWinAbsPath("/home/u"), false);
  assert.strictEqual(sandbox.isWinAbsPath("relative/path"), false);
  console.log("path translation OK");

  // script guards
  (async () => {
    try {
      await sandbox.runInSandbox({ script: "x".repeat(9000) });
      assert.fail("long script should throw");
    } catch (e) {
      assert.ok(/script too long/.test(e.message));
    }
    try {
      await sandbox.runInSandbox({ script: "   " });
      assert.fail("empty script should throw");
    } catch (e) {
      assert.ok(/empty script/.test(e.message));
    }
    console.log("script guards OK");

    // live WSL (only asserts when a distro actually exists)
    if (!sandbox.wslAvailable()) {
      console.log("WSL not present — live tests skipped");
      return;
    }
    const p = await sandbox.probe();
    console.log("probe:", JSON.stringify({ state: p.state, distro: p.distro, distros: p.distros.length }));
    if (p.state !== "ready") {
      console.log("sandbox not ready — live exec skipped:", p.hint);
      return;
    }
    const r = await sandbox.runInSandbox({ script: "echo emberling-$((20+3)); uname -s | head -c 20" });
    assert.strictEqual(r.exitCode, 0, "exit code");
    assert.ok(r.stdout.includes("emberling-23"), "stdout: " + JSON.stringify(r.stdout));
    assert.ok(/Linux/.test(r.stdout), "uname in sandbox: " + JSON.stringify(r.stdout));
    assert.ok(r.sandbox, "sandbox distro recorded");
    console.log("live sandbox exec OK on", r.sandbox);
  })().catch((e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  });
}

main();
