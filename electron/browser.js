// Browser control — the agent's hands on the real web (per the QwenWork REA:
// CDP against the user's actual browser, element targeting via an in-page
// snapshot, screenshots, dialogs, typing — no bundled Chromium needed).
//
// Architecture:
//   - the module launches the installed Chrome/Edge with an isolated persistent
//     profile and --remote-debugging-port=0, then reads DevToolsActivePort.
//   - one CDP WebSocket session per tab; commands: Page.navigate,
//     Runtime.evaluate (element snapshots, rects, reads), Input.dispatch*
//     (real clicks/keys), Page.captureScreenshot.
//   - element targeting: browser_snapshot assigns indexes to interactive
//     elements and remembers their generated CSS paths; clicks resolve the
//     stored path to a viewport rect, then dispatch a real mouse event.
//
// Security contract:
//   - navigation is http/https only, no credentials in the URL.
//   - the CDP endpoint is this machine's own loopback, created by us.
//   - this module spawns nothing: the browser launch is a CONSTANT PowerShell
//     script (literal exe, literal arguments) executed through the trusted
//     shell-runner — the same contract as every other approved command.
//   - click/type pass the tool-approval gate like other privileged tools.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { WebSocket } = require("ws");
const { runShellScript } = require("./shell-runner");

// Fixed literal candidates for the installed browser.
const BROWSER_EXES = {
  chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  chrome86: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  edge86: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  edge: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
};
const BROWSER_ORDER = ["chrome", "chrome86", "edge86", "edge"];

// Fixed per-machine automation profile (literal path; Public is writable by
// any local user). Constant so the launch script is a pure literal.
const PROFILE_DIR = "C:\\Users\\Public\\emberling-browser-profile";

// Constant launch scripts — one per browser. Start-Process returns
// immediately; the port shows up in the profile's DevToolsActivePort file.
// -PassThru prints the browser pid so stop/abort can kill what we launched.
const LAUNCH_SCRIPTS = {
  chrome:
    "(Start-Process -FilePath 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' -ArgumentList '--remote-debugging-port=0','--user-data-dir=" +
    PROFILE_DIR +
    "','--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--hide-crash-restore-bubble','--window-size=1280,900','about:blank' -PassThru).Id",
  chrome86:
    "(Start-Process -FilePath 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' -ArgumentList '--remote-debugging-port=0','--user-data-dir=" +
    PROFILE_DIR +
    "','--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--hide-crash-restore-bubble','--window-size=1280,900','about:blank' -PassThru).Id",
  edge86:
    "(Start-Process -FilePath 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' -ArgumentList '--remote-debugging-port=0','--user-data-dir=" +
    PROFILE_DIR +
    "','--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--hide-crash-restore-bubble','--window-size=1280,900','about:blank' -PassThru).Id",
  edge:
    "(Start-Process -FilePath 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' -ArgumentList '--remote-debugging-port=0','--user-data-dir=" +
    PROFILE_DIR +
    "','--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--hide-crash-restore-bubble','--window-size=1280,900','about:blank' -PassThru).Id",
};

function findBrowser() {
  for (const key of BROWSER_ORDER) {
    if (fs.existsSync(BROWSER_EXES[key])) return { key, name: BROWSER_EXES[key].includes("msedge") ? "Edge" : "Chrome" };
  }
  return null;
}

function validHttpUrl(raw) {
  try {
    const u = new URL(String(raw));
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

let session = null; // { cdp, browserName, port, browserPid, launched }
let turnSignal = null; // the agent turn's AbortSignal, set per tool call

// AbortError helper: stopping a turn must stop browser work immediately.
function abortError() {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

function throwIfAborted() {
  if (turnSignal?.aborted) {
    cleanup(true);
    throw abortError();
  }
}

// Close the CDP session; kill=true terminates every browser process bound to
// our automation profile. The profile directory is exclusively ours (fixed
// literal path), so anything carrying its marker was launched by us — in this
// run or any earlier one — and killing it can never touch a user browser.
function cleanup(kill) {
  try { session?.cdp.close(); } catch {}
  if (kill) {
    runShellScript({
      script:
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*emberling-browser-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
    }).catch(() => {});
  }
  session = null;
}

function setSignal(signal) {
  turnSignal = signal;
  // stop arriving while idle in a tool: tear down immediately (the signal
  // itself stays aborted so every later throwIfAborted() keeps firing)
  if (signal) {
    signal.addEventListener("abort", () => {
      cleanup(true);
    }, { once: true });
  }
}

async function discoverPort() {
  // port=0 makes Chromium write the chosen port to DevToolsActivePort
  const portFile = path.join(PROFILE_DIR, "DevToolsActivePort");
  for (let i = 0; i < 40; i++) {
    throwIfAborted();
    try {
      const text = await fsp.readFile(portFile, "utf8");
      const port = String(text || "").split("\n")[0].trim();
      if (port && /^\d+$/.test(port)) return Number(port);
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("browser did not expose a debugging port");
}

function httpGetJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("CDP endpoint timeout"));
    });
  });
}

// Minimal CDP connection: one WebSocket per tab, id-matched request/response.
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    let nextId = 1;
    const pending = new Map();
    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error("CDP " + (msg.error.message || "error")));
        else res(msg.result);
      }
    });
    ws.on("error", (err) => {
      for (const { reject: rej } of pending.values()) rej(err);
      pending.clear();
    });
    ws.on("close", () => {
      for (const { reject: rej } of pending.values()) rej(new Error("CDP connection closed"));
      pending.clear();
    });
    ws.on("open", () => {
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
              if (pending.has(id)) {
                pending.delete(id);
                rej(new Error("CDP " + method + " timed out"));
              }
            }, 30000);
          }),
        close: () => {
          try { ws.close(); } catch {}
        },
      });
    });
    ws.once("error", reject);
  });
}

async function ensureSession() {
  throwIfAborted();
  // quick liveness probe — a browser that is shutting down (e.g. killed by a
  // previous aborted turn) still accepts the socket but never answers
  const ping = (cdp, ms = 3000) =>
    Promise.race([
      cdp.send("Runtime.evaluate", { expression: "1", returnByValue: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), ms)),
    ]);
  if (session) {
    try {
      await ping(session.cdp);
      return session;
    } catch {
      try { session.cdp.close(); } catch {}
      session = null;
    }
  }
  const browser = findBrowser();
  if (!browser) throw new Error("No Chrome or Edge installation found — install one to enable browser control.");
  await fsp.mkdir(PROFILE_DIR, { recursive: true }).catch(() => {});
  const oldPort = await discoverPort().catch(() => null);
  if (oldPort) {
    // a browser from a previous session may still be alive — try to reuse,
    // but only if it answers a quick ping (a dying one would hang the turn)
    try {
      const list = await httpGetJson(oldPort, "/json/list");
      const page = Array.isArray(list) ? list.find((t) => t.type === "page") : null;
      if (page) {
        const cdp = await connect(page.webSocketDebuggerUrl);
        await ping(cdp);
        // reused browser: never kill on abort (not ours), just detach
        session = { cdp, browserName: browser.name, port: oldPort, browserPid: null, launched: false };
        return session;
      }
    } catch {
      // stale browser — fall through to a fresh launch
    }
  }
  // launch via the trusted runner; the script prints the browser pid.
  // A previous run's kill can leave a stale DevToolsActivePort file — clear
  // it so the wait loop only ever sees the fresh browser's port.
  const portFile = path.join(PROFILE_DIR, "DevToolsActivePort");
  await fsp.unlink(portFile).catch(() => {});
  // Chrome 87+ ignores --disable-session-crashed-bubble: after a forced kill
  // the "Restore pages?" bubble shows over the agent's window. Clear the
  // crash marker in the profile's Preferences before every launch.
  const prefsFile = path.join(PROFILE_DIR, "Default", "Preferences");
  try {
    const prefs = JSON.parse(await fsp.readFile(prefsFile, "utf8"));
    if (prefs.profile?.exit_type !== "Normal") {
      prefs.profile = prefs.profile || {};
      prefs.profile.exit_type = "Normal";
      prefs.profile.exited_cleanly = true;
      await fsp.writeFile(prefsFile, JSON.stringify(prefs));
    }
  } catch {}
  const launched = await runShellScript({ script: LAUNCH_SCRIPTS[browser.key] });
  const pidMatch = String(launched.stdout || "").trim().match(/\d+/);
  // wait for a page target, re-reading the (fresh) port file each iteration
  let page = null;
  let port = null;
  for (let i = 0; i < 40; i++) {
    throwIfAborted();
    port = (await discoverPort().catch(() => null)) || null;
    if (port) {
      try {
        const list = await httpGetJson(port, "/json/list");
        page = Array.isArray(list) ? list.find((t) => t.type === "page") : null;
        if (page) break;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!page) throw new Error("browser started but no page target appeared");
  const cdp = await connect(page.webSocketDebuggerUrl);
  session = { cdp, browserName: browser.name, port, browserPid: pidMatch ? Number(pidMatch[0]) : null, launched: true };
  return session;
}

/* ---------- in-page helpers ---------- */

// Snapshot script: numbered interactive elements with generated CSS paths.
const SNAPSHOT_JS = `(function(){
  const out = [];
  const els = document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="link"],[role="checkbox"],[contenteditable="true"],summary');
  let i = 0;
  for (const el of els) {
    if (out.length >= 60) break;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 8) {
      let seg = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(seg + "#" + CSS.escape(node.id)); break; }
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) seg += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(seg);
      node = parent;
    }
    out.push({
      index: i++,
      tag: el.tagName.toLowerCase(),
      path: parts.join(" > "),
      text: ((el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || "") + "").trim().slice(0, 80),
      href: el.tagName === "A" ? el.href : undefined,
      checked: el.checked,
    });
  }
  return JSON.stringify({ url: location.href, title: document.title, elements: out, bodyText: (document.body ? document.body.innerText : "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 6000) });
})()`;

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false });
  if (r.exceptionDetails) {
    throw new Error("page error: " + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "unknown").slice(0, 200));
  }
  return r.result?.value;
}

/* ---------- abort-aware primitives ---------- */

// One CDP command, raced against the turn's abort signal: stopping a turn
// must interrupt in-flight browser work, not wait it out.
async function cdp(method, params = {}) {
  if (!session) throw abortError();
  if (turnSignal?.aborted) {
    cleanup(true);
    throw abortError();
  }
  let onAbort = null;
  try {
    return await Promise.race([
      session.cdp.send(method, params),
      new Promise((_, reject) => {
        onAbort = () => {
          cleanup(true);
          reject(abortError());
        };
        turnSignal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort && turnSignal) turnSignal.removeEventListener("abort", onAbort);
  }
}

async function sleep(ms) {
  throwIfAborted();
  await Promise.race([
    new Promise((r) => setTimeout(r, ms)),
    new Promise((_, reject) => {
      const onAbort = () => reject(abortError());
      turnSignal?.addEventListener("abort", onAbort, { once: true });
      setTimeout(() => turnSignal?.removeEventListener?.("abort", onAbort), ms);
    }),
  ]).catch((e) => {
    if (e?.name === "AbortError") throw e;
  });
}

/* ---------- tool implementations ---------- */

async function open(rawUrl, signal) {
  setSignal(signal);
  throwIfAborted();
  const u = validHttpUrl(rawUrl);
  if (!u) throw new Error("browser needs a valid http(s) URL");
  const s = await ensureSession();
  await cdp("Page.navigate", { url: u.toString() });
  await sleep(1200);
  const snap = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, url: snap.url, title: snap.title, browser: s.browserName, elements: snap.elements };
}

async function snapshot(signal) {
  setSignal(signal);
  throwIfAborted();
  const s = await ensureSession();
  const snap = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, ...snap, browser: s.browserName };
}

async function read(signal) {
  setSignal(signal);
  throwIfAborted();
  const s = await ensureSession();
  const text = await evaluate(s.cdp, "(document.body ? document.body.innerText : '').replace(/\\n{3,}/g,'\\n\\n').slice(0,12000)");
  return { ok: true, url: await evaluate(s.cdp, "location.href"), text };
}

async function click({ index }, signal) {
  setSignal(signal);
  throwIfAborted();
  const s = await ensureSession();
  const snap = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  const el = snap.elements.find((e) => e.index === Number(index));
  if (!el) throw new Error("no element #" + index + " — take browser_snapshot first");
  const rectJson = await evaluate(
    s.cdp,
    "(function(){const el=document.querySelector(" + JSON.stringify(el.path) + ");if(!el)return null;const r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()"
  );
  if (!rectJson) throw new Error("element #" + index + " disappeared");
  const { x, y } = JSON.parse(rectJson);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(900);
  const after = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, clicked: el.text || el.tag, url: after.url, title: after.title, elements: after.elements };
}

async function typeText({ index, text, submit }, signal) {
  setSignal(signal);
  throwIfAborted();
  const s = await ensureSession();
  const snap = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  const el = snap.elements.find((e) => e.index === Number(index));
  if (!el) throw new Error("no element #" + index + " — take browser_snapshot first");
  const rectJson = await evaluate(
    s.cdp,
    "(function(){const el=document.querySelector(" + JSON.stringify(el.path) + ");if(!el)return null;const r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()"
  );
  if (!rectJson) throw new Error("element #" + index + " disappeared");
  const { x, y } = JSON.parse(rectJson);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(250);
  await cdp("Input.insertText", { text: String(text ?? "") });
  if (submit) {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(1200);
  }
  const after = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, url: after.url, title: after.title, elements: after.elements };
}

async function scroll({ direction, amount }, signal) {
  setSignal(signal);
  throwIfAborted();
  const s = await ensureSession();
  const dy = (direction === "up" ? -1 : 1) * Math.min(Math.max(Number(amount) || 5, 1), 25) * 100;
  await cdp("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: dy });
  await sleep(400);
  const snap = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, url: snap.url, elements: snap.elements };
}

async function screenshot(signal) {
  setSignal(signal);
  throwIfAborted();
  const s = await ensureSession();
  const shot = await cdp("Page.captureScreenshot", { format: "png" });
  return { ok: true, pngBase64: shot.data, browser: s.browserName };
}

// Detach from the session. kill=true also terminates the browser we launched
// (our isolated automation profile) — used when a turn is stopped/aborted so
// no window is left behind or relaunched behind the user's back.
function close(kill = false) {
  if (!session) return { ok: true, note: "no browser session" };
  cleanup(kill);
  return { ok: true, killed: !!kill };
}

module.exports = { open, snapshot, read, click, type: typeText, scroll, screenshot, close, findBrowser, validHttpUrl };
