// REA runtime inspection of the installed original Grok Bot:
// launch with a CDP port, capture the composer design tokens from the live
// DOM (geometry, colors, buttons), then click the "+" and dump the menu
// contents. Only composer-region screenshots; no chat text is extracted.
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const EXE = "C:\\Users\\thaku\\AppData\\Local\\Programs\\Grok Bot\\Grok Bot.exe";
const PORT = "9281";

let electron;
try {
  electron = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: "ignore", detached: true });
  electron.unref();
} catch (e) {
  console.error("launch failed:", e.message);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getMainWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const pages = await res.json();
      const main = pages.find((p) => p.type === "page" && !p.url.includes("devtools"));
      if (main) return main.webSocketDebuggerUrl;
    } catch {}
    await sleep(1000);
  }
  return null;
}

const wsUrl = await getMainWs();
if (!wsUrl) {
  console.log("NO PAGE — original may be showing a login or single-instance lock");
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const r = pending.get(msg.id);
    pending.delete(msg.id);
    r(msg);
  }
};
await new Promise((r) => (ws.onopen = r));
await sleep(6000); // let the UI settle

const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false });
  if (r?.result?.exceptionDetails) return { __err: String(r.result.exceptionDetails.exception?.description || "").slice(0, 200) };
  return r?.result?.result?.value;
};

// 1. composer geometry + styles
const design = await evalJs(`(function(){
  const q = (s) => document.querySelector(s);
  const pill = q('[class*="ui-prompt-input"]') || q('[class*="prompt-input"]');
  if (!pill) return { found: false };
  const cs = getComputedStyle(pill);
  const round = (v) => Math.round(parseFloat(v) || 0);
  const btns = [...pill.querySelectorAll('button')].slice(0, 12).map((b) => ({
    aria: b.getAttribute('aria-label') || b.title || '',
    cls: (b.className || '').slice(0, 60),
    w: round(getComputedStyle(b).width), h: round(getComputedStyle(b).height),
    radius: getComputedStyle(b).borderRadius,
    bg: getComputedStyle(b).backgroundColor,
  }));
  return {
    found: true,
    cls: pill.className.slice(0, 120),
    radius: cs.borderRadius, bg: cs.backgroundColor, border: cs.border,
    pad: cs.padding, w: round(cs.width), h: round(cs.height),
    editor: (() => { const e = pill.querySelector('.ProseMirror'); if (!e) return null; const s = getComputedStyle(e); return { minH: round(s.minHeight), pad: s.padding, fs: s.fontSize, lh: s.lineHeight }; })(),
    buttons: btns,
  };
})()`);
console.log("DESIGN:", JSON.stringify(design, null, 1));

// 2. full screenshot (design evidence)
const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot?.result?.data) {
  writeFileSync(resolve("docs/rea/grok-original-chat.png"), Buffer.from(shot.result.data, "base64"));
  console.log("saved docs/rea/grok-original-chat.png");
}

// 3. find the "+" button and click it
const plus = await evalJs(`(function(){
  const pill = document.querySelector('[class*="ui-prompt-input"]') || document.querySelector('[class*="prompt-input"]');
  if (!pill) return null;
  const btns = [...pill.querySelectorAll('button')];
  const plus = btns.find((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 20 && r.width < 60 && (b.getAttribute('aria-label') || '').match(/attach|add|plus|upload/i) !== null;
  }) || btns[0];
  if (!plus) return null;
  const r = plus.getBoundingClientRect();
  const cs = getComputedStyle(plus);
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), aria: plus.getAttribute('aria-label') || plus.title || '', bg: cs.backgroundColor, radius: cs.borderRadius, w: Math.round(r.width) };
})()`);
console.log("PLUS:", JSON.stringify(plus));

if (plus?.x) {
  // real mouse click on the + button
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: plus.x, y: plus.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: plus.x, y: plus.y, button: "left", clickCount: 1 });
  await sleep(1200);
  const menu = await evalJs(`(function(){
    // the open menu: look for a popover/menu surface that appeared
    const candidates = [...document.querySelectorAll('[role="menu"],[role="dialog"],[data-radix-popper-content-wrapper] > *,[class*="menu" i],[class*="popover" i],[class*="dropdown" i]')];
    const visible = candidates.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 120 && r.height > 60 && r.height < 800; });
    if (!visible.length) return { found: false };
    const el = visible[visible.length - 1];
    const r = el.getBoundingClientRect();
    const items = [...el.querySelectorAll('button,[role="menuitem"],a')].map((b) => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim().replace(/\\s+/g, ' ')).filter((t) => t && t.length < 60);
    return { found: true, cls: el.className.slice(0, 80), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, items: [...new Set(items)].slice(0, 20) };
  })()`);
  console.log("MENU:", JSON.stringify(menu, null, 1));
  const shot2 = await send("Page.captureScreenshot", { format: "png" });
  if (shot2?.result?.data) {
    writeFileSync(resolve("docs/rea/grok-original-plus-menu.png"), Buffer.from(shot2.result.data, "base64"));
    console.log("saved docs/rea/grok-original-plus-menu.png");
  }
}

ws.close();
await sleep(400);
try { execSync('taskkill /IM "Grok Bot.exe" /F 2>nul', { stdio: "ignore", shell: "cmd.exe" }); } catch {}
process.exit(0);
