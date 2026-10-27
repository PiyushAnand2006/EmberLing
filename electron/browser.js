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
const LAUNCH_SCRIPTS = {
  chrome:
    "Start-Process -FilePath 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' -ArgumentList '--remote-debugging-port=0','--user-data-dir=" +
    PROFILE_DIR +
    "','--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--window-size=1280,900','about:blank' -WindowStyle Hidden",
  chrome86:
    "Start-Process -FilePath 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' -ArgumentList '--remote-debugging-port=0','--user-data-dir=" +
    PROFILE_DIR +
    "','--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--window-size=1280,900','about:blank' -WindowStyle Hidden",
  edge86:
    "Start-Process -FilePath 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' -ArgumentList '--remote-debugging-port=0','--user-data-dir=" +
    PROFILE_DIR +
    "','--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--window-size=1280,900','about:blank' -WindowStyle Hidden",
  edge:
    "Start-Process -FilePath 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' -ArgumentList '--remote-debugging-port=0','--user-data-dir=" +
    PROFILE_DIR +
    "','--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--window-size=1280,900','about:blank' -WindowStyle Hidden",
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

let session = null; // { cdp, browserName, port }

async function discoverPort() {
  // port=0 makes Chromium write the chosen port to DevToolsActivePort
  const portFile = path.join(PROFILE_DIR, "DevToolsActivePort");
  for (let i = 0; i < 40; i++) {
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
  if (session) {
    // liveness check: page still responds?
    try {
      await session.cdp.send("Runtime.evaluate", { expression: "1", returnByValue: true });
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
    // a browser from a previous session may still be alive — try to reuse
    try {
      const list = await httpGetJson(oldPort, "/json/list");
      const page = Array.isArray(list) ? list.find((t) => t.type === "page") : null;
      if (page) {
        const cdp = await connect(page.webSocketDebuggerUrl);
        session = { cdp, browserName: browser.name, port: oldPort };
        return session;
      }
    } catch {
      // stale browser — fall through to a fresh launch
    }
  }
  // launch via the trusted runner with a constant literal script
  await runShellScript({ script: LAUNCH_SCRIPTS[browser.key] });
  const port = await discoverPort();
  // wait for a page target
  let page = null;
  for (let i = 0; i < 20; i++) {
    try {
      const list = await httpGetJson(port, "/json/list");
      page = Array.isArray(list) ? list.find((t) => t.type === "page") : null;
      if (page) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!page) throw new Error("browser started but no page target appeared");
  const cdp = await connect(page.webSocketDebuggerUrl);
  session = { cdp, browserName: browser.name, port };
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

/* ---------- tool implementations ---------- */

async function open(rawUrl) {
  const u = validHttpUrl(rawUrl);
  if (!u) throw new Error("browser needs a valid http(s) URL");
  const s = await ensureSession();
  await s.cdp.send("Page.navigate", { url: u.toString() });
  await new Promise((r) => setTimeout(r, 1200));
  const snap = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, url: snap.url, title: snap.title, browser: s.browserName, elements: snap.elements };
}

async function snapshot() {
  const s = await ensureSession();
  const snap = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, ...snap, browser: s.browserName };
}

async function read() {
  const s = await ensureSession();
  const text = await evaluate(s.cdp, "(document.body ? document.body.innerText : '').replace(/\\n{3,}/g,'\\n\\n').slice(0,12000)");
  return { ok: true, url: await evaluate(s.cdp, "location.href"), text };
}

async function click({ index }) {
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
  await s.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await s.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 900));
  const after = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, clicked: el.text || el.tag, url: after.url, title: after.title, elements: after.elements };
}

async function typeText({ index, text, submit }) {
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
  await s.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await s.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 250));
  await s.cdp.send("Input.insertText", { text: String(text ?? "") });
  if (submit) {
    await s.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await s.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await new Promise((r) => setTimeout(r, 1200));
  }
  const after = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, url: after.url, title: after.title, elements: after.elements };
}

async function scroll({ direction, amount }) {
  const s = await ensureSession();
  const dy = (direction === "up" ? -1 : 1) * Math.min(Math.max(Number(amount) || 5, 1), 25) * 100;
  await s.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: dy });
  await new Promise((r) => setTimeout(r, 400));
  const snap = JSON.parse(await evaluate(s.cdp, SNAPSHOT_JS));
  return { ok: true, url: snap.url, elements: snap.elements };
}

async function screenshot() {
  const s = await ensureSession();
  const shot = await s.cdp.send("Page.captureScreenshot", { format: "png" });
  return { ok: true, pngBase64: shot.data, browser: s.browserName };
}

async function close() {
  if (!session) return { ok: true, note: "no browser session" };
  try { session.cdp.close(); } catch {}
  session = null;
  return { ok: true };
}

module.exports = { open, snapshot, read, click, type: typeText, scroll, screenshot, close, findBrowser, validHttpUrl };
