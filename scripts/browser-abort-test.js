// Live abort test: start a browser task (open a slow page), abort the turn
// mid-flight, and verify (a) the tool rejects with AbortError, (b) the browser
// we launched is killed (pid gone), (c) a queued tool after abort refuses.
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const browser = require("../electron/browser");

async function main() {
  // 1. URL guard regression
  assert.strictEqual(browser.validHttpUrl("file:///etc/passwd"), null);

  // 2. real session + mid-flight abort
  const controller = new AbortController();
  const openPromise = browser.open("https://example.com", controller.signal);
  // abort ~300ms in — while open() is still settling (navigate + sleep 1200)
  await new Promise((r) => setTimeout(r, 300));
  controller.abort();

  let aborted = false;
  try {
    await openPromise;
  } catch (e) {
    aborted = e.name === "AbortError";
    if (!aborted) console.log("open error (non-abort):", e.message);
  }
  assert.ok(aborted, "in-flight open() must reject with AbortError");
  console.log("mid-flight abort OK — open() rejected with AbortError");

  // 3. queued tool after abort refuses immediately
  await assert.rejects(
    () => browser.snapshot(controller.signal),
    (e) => e.name === "AbortError",
    "post-abort tools must refuse"
  );
  console.log("post-abort refusal OK");

  // 4. the browser we launched is dead (pid killed by cleanup(true)) —
  //    Stop-Process of a dozen chrome children takes a moment: poll up to 8s.
  //    The match string is assembled at runtime inside PowerShell so this
  //    counting process's own command line can never match itself.
  let alive = -1;
  const countScript =
    "$p = '*--user-data-dir=*emberling-browser' + '-profile*'; " +
    "(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like $p } | Measure-Object).Count";
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", countScript], { encoding: "utf8" }).trim();
      alive = Number(out) || 0;
      if (alive === 0) break;
    } catch {}
  }
  assert.strictEqual(alive, 0, "spawned browser must be killed on abort, found " + alive + " processes");
  console.log("browser killed on abort OK (0 processes with the automation profile)");

  // 5. fresh session works again after the abort (no stuck state)
  const controller2 = new AbortController();
  const again = await browser.open("https://example.com", controller2.signal);
  assert.ok(again.ok && again.url.includes("example.com"), "fresh session after abort: " + JSON.stringify(again).slice(0, 120));
  await browser.close(true);
  console.log("fresh session after abort OK");
  console.log("ALL BROWSER ABORT TESTS PASSED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
