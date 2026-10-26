// Real-click tests for menu item selection + conversation row menus.
import { spawn } from "node:child_process";

const port = "9260";
const electron = spawn(process.execPath, ["node_modules/electron/cli.js", ".", `--remote-debugging-port=${port}`], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getMainWs() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await res.json();
      const main = pages.find((p) => p.title === "Emberling");
      if (main) return main.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  return null;
}

const wsUrl = await getMainWs();
if (!wsUrl) {
  console.log("NO PAGE");
  electron.kill();
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const errors = [];
const send = (method, params) =>
  new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r && r.result && r.result.value;
};
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    errors.push("RENDER-EXC: " + String((d.exception && (d.exception.description || d.exception.value)) || d.text).slice(0, 250));
  }
};
await new Promise((r) => {
  ws.onopen = r;
});
await send("Runtime.enable");
await sleep(1200);

const results = [];
const test = async (name, fn) => {
  try {
    const ok = await fn();
    results.push((ok ? "PASS" : "FAIL") + "  " + name);
  } catch (e) {
    results.push("ERR   " + name + " :: " + String(e).slice(0, 120));
  }
};
const realClick = async (sel, nth = 0) => {
  const box = await evalJs(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`);
  if (!box) return false;
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(30);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(30);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  return true;
};
const exists = (sel) => evalJs(`!!document.querySelector(${JSON.stringify(sel)})`);

// real mouse move over an element (drives CSS :hover, unlike synthetic events)
const hover = async (sel, nth = 0) => {
  const box = await evalJs(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`);
  if (!box) return false;
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(150);
  return true;
};

if ((await evalJs(`document.querySelector('.titlebar-title')?.textContent || ''`)).includes('Welcome')) {
  await evalJs(`[...document.querySelectorAll('button')].find(b => /skip/i.test(b.textContent))?.click(); true`);
  await sleep(700);
}

// model menu item selection changes the model in settings (discovered ids
// may make the chip label differ from the menu label, so check the store)
await test("model menu item select (real clicks)", async () => {
  const before = (await evalJs(`(async () => { const s = await window.emberling.store.get('settings'); return s?.providers?.[s?.activeProvider]?.model || ''; })()`)) || "";
  await realClick(".composer .chip-btn", 0);
  await sleep(500);
  if (!(await exists(".menu"))) return false;
  const itemTexts = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll('.menu .menu-item')].map(m => m.textContent))`));
  if (itemTexts.length < 2) return false;
  // pick a static item whose index differs from the currently-active one
  let idx = 0;
  for (let i = 0; i < itemTexts.length; i++) {
    if (!itemTexts[i].includes("—")) continue;
    if (!String(before).toLowerCase().includes(itemTexts[i].split(" — ")[0].split("/").pop().toLowerCase().split(":")[0])) {
      idx = i;
      break;
    }
  }
  await realClick(".menu .menu-item", idx);
  await sleep(500);
  const after = (await evalJs(`(async () => { const s = await window.emberling.store.get('settings'); return s?.providers?.[s?.activeProvider]?.model || ''; })()`)) || "";
  return !!after && after !== String(before);
});

// approval menu item select
await test("approval menu item select (real clicks)", async () => {
  await realClick(".composer .chip-btn", 1);
  await sleep(350);
  if (!(await exists(".menu"))) return false;
  const items = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll('.menu .menu-item')].map(m => m.textContent))`));
  const idx = items.findIndex((t) => t.includes("automatically"));
  await realClick(".menu .menu-item", idx);
  await sleep(350);
  return await evalJs(`document.querySelectorAll('.composer .chip-btn')[1]?.textContent.includes('automatically')`);
});

// send a message so a conversation exists, then test its row menu (pin)
await test("conversation row menu pin (real clicks)", async () => {
  await evalJs(`document.querySelector('.composer-input')?.focus(); true`);
  await send("Input.insertText", { text: "hi there" });
  await sleep(250);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(2500);
  if (!(await exists(".conv-item"))) return false;
  await hover(".conv-item", 0); // real hover reveals the row chevron
  if (!(await exists(".conv-item .conv-item-actions .icon-btn"))) return false;
  await realClick(".conv-item .conv-item-actions .icon-btn", 0);
  await sleep(350);
  if (!(await exists(".menu"))) return false;
  const items = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll('.menu .menu-item')].map(m => m.textContent))`));
  const idx = items.findIndex((t) => t.trim() === "Pin");
  if (idx < 0) return false;
  await realClick(".menu .menu-item", idx);
  await sleep(400);
  return await evalJs(`!!document.querySelector('.sidebar-section-title')`);
});

// message reaction via hover actions
await test("message react button (real clicks)", async () => {
  await hover(".msg-row", 0);
  await sleep(400); // let :hover actions fade in
  await hover(".msg-actions .icon-btn", 0);
  await sleep(150);
  await realClick(".msg-actions .icon-btn", 0); // smile (react) button
  await sleep(450);
  const hasEmojiRow = await exists(".menu .menu-item");
  if (!hasEmojiRow) return false;
  await realClick(".menu .menu-item", 0);
  await sleep(450);
  return await evalJs(`!!document.querySelector('.reaction-chip')`);
});

console.log(results.join("\n"));
console.log("---- RENDER ERRORS (" + errors.length + ") ----");
console.log([...new Set(errors)].slice(0, 6).join("\n").slice(0, 1200));
ws.close();
electron.kill();
process.exit(0);
