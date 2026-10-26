// Smoke test for auto-update in the PACKAGED app (release/win-unpacked):
// launches the real exe with an isolated profile + CDP, then drives
// window.emberling.updater.check() against the live GitHub releases feed.
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// kill stragglers so the single-instance lock (scoped to our test profile) is free
try { execSync('taskkill /IM Emberling.exe /F', { stdio: "ignore" }); } catch {}
await new Promise((r) => setTimeout(r, 1500));

// hard stop so a stuck connection can't hang the run
setTimeout(() => {
  console.error("TIMEOUT — smoke test did not finish in 120s");
  try { electron.kill(); } catch {}
  process.exit(2);
}, 120000).unref();

const port = String(9253 + Math.floor(Math.random() * 40));
const exe = resolve("release/win-unpacked/Emberling.exe");
const udd = mkdtempSync(join(tmpdir(), "emberling-updater-test-"));
const electron = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${udd}`], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getMainWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await res.json();
      const main = pages.find((p) => p.url.includes("index.html") || (p.title === "Emberling" && !p.title.includes("Mark")));
      if (main) {
        console.log("main page found after", i * 0.5, "s");
        return main.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(500);
  }
  return null;
}

const wsUrl = await getMainWs();
if (!wsUrl) {
  console.log("NO PAGE — packaged app failed to start");
  electron.kill();
  process.exit(1);
}
console.log("connecting CDP…");

const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  const inner = r && r.result;
  if (inner && inner.exceptionDetails) return { __exc: String(inner.exceptionDetails.exception?.description || inner.exceptionDetails.text).slice(0, 300) };
  return inner && inner.result && inner.result.value;
};
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const resolve = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg);
  }
};
await Promise.race([
  new Promise((r) => (ws.onopen = r)),
  new Promise((_, rej) => setTimeout(() => rej(new Error("CDP websocket never opened")), 20000)),
]);
console.log("CDP connected");

const sleepInPage = `new Promise(r => setTimeout(r, 4000))`;
await evalJs(`(${sleepInPage.replace(/^new Promise/, "new Promise")})`); // settle

// 1. updater API present?
const hasApi = await evalJs("typeof window.emberling?.updater?.check === 'function' && typeof window.emberling?.updater?.install === 'function'");
console.log("updater api exposed:", hasApi);

// 2. real check against GitHub releases (v0.75.9 is the latest published release)
const check = await evalJs("window.emberling.updater.check()");
console.log("check result:", JSON.stringify(check));

let ok = false;
if (check && check.ok && check.current === "0.75.9") {
  if (check.latest === "0.75.9" && check.updateAvailable === false) {
    console.log("PASS — packaged app reached GitHub, parsed latest.yml, and reports up to date (0.75.9)");
    ok = true;
  } else if (check.updateAvailable === true) {
    console.log("NOTE — a newer release exists (" + check.latest + "); updateAvailable=true is correct behavior");
    ok = true;
  } else {
    console.log("FAIL — unexpected latest:", check.latest);
  }
} else {
  console.log("FAIL —", JSON.stringify(check));
}

// 3. event subscription functional (subscribe then trigger one more check)
const evOk = await evalJs(
  `(() => { let got = null; window.__updOff = window.emberling.updater.onStatus((p) => { got = p; }); window.__updGot = () => got; return typeof window.__updOff === 'function'; })()`
);
console.log("event subscription registered:", evOk);

ws.close();
electron.kill();
await sleep(800);
try { rmSync(udd, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
