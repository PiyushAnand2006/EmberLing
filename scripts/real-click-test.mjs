// Real-mouse click tests: dispatches Input.dispatchMouseEvent at element
// centers (exercises hit-testing, overlays, drag regions) unlike .click().
import { spawn } from "node:child_process";

const port = "9253";
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
  if (r && r.exceptionDetails) {
    errors.push("EVAL-EXC: " + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200));
    return null;
  }
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

// real click at the center of the first element matching sel
const realClick = async (sel, nth = 0) => {
  const box = await evalJs(`(() => {
    const els = document.querySelectorAll(${JSON.stringify(sel)});
    const el = els[${nth}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height });
  })()`);
  if (!box) return { ok: false, why: "not found" };
  const { x, y } = JSON.parse(box);
  // what element would REALLY receive the click here?
  const topEl = await evalJs(`document.elementFromPoint(${x}, ${y})?.outerHTML?.slice(0, 120)`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(40);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(40);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  return { ok: true, topEl };
};

const exists = (sel) => evalJs(`!!document.querySelector(${JSON.stringify(sel)})`);

if (await exists(".empty-state .orb")) {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Skip'))?.click(); true`);
  await sleep(600);
}

// what element is on top at each interesting button location? (overlay audit)
await test("real click: sidebar new chat", async () => {
  const r = await realClick(".sidebar-new-chat");
  await sleep(400);
  return r.ok && (await exists(".composer-input"));
});

await test("real click: sidebar collapse chevron", async () => {
  const before = await evalJs(`document.querySelector('.sidebar')?.className`);
  const r = await realClick(".sidebar-header .icon-btn");
  await sleep(350);
  const after = await evalJs(`document.querySelector('.sidebar')?.className`);
  return r.ok && before !== after;
});

await test("real click: footer Settings row", async () => {
  const r = await realClick(".sidebar-footer .footer-row:nth-child(5)");
  await sleep(400);
  return r.ok && (await exists(".screen-nav"));
});

await test("real click: settings nav Appearance", async () => {
  await realClick(".sidebar-footer .footer-row:nth-child(5)");
  await sleep(400);
  const r = await realClick(".screen-nav .nav-row:nth-child(4)");
  await sleep(300);
  return r.ok && (await evalJs(`document.querySelector('.screen-nav .nav-row:nth-child(4)')?.className.includes('active')`));
});

await test("real click: back via new chat", async () => {
  const r = await realClick(".sidebar-new-chat");
  await sleep(400);
  return r.ok && (await exists(".composer-input"));
});

await test("real click: model chip opens menu", async () => {
  const r = await realClick(".composer .chip-btn");
  await sleep(300);
  const open = await exists(".menu");
  await realClick("body");
  await sleep(150);
  return r.ok && open;
});

await test("real click: suggestion chip fills composer", async () => {
  // go to empty state first: new chat
  await evalJs(`window.dispatchEvent(new CustomEvent('navigate-new')); true`);
  await realClick(".sidebar-new-chat");
  await sleep(300);
  const r = await realClick(".suggestion-chip");
  await sleep(300);
  const val = await evalJs(`document.querySelector('.composer-input')?.value || ''`);
  return r.ok && val.length > 0;
});

await test("real click: window minimize then restore", async () => {
  const r = await realClick(".window-controls button:nth-child(1)");
  await sleep(600);
  return r.ok;
});

// overlay audit: titlebar drag region vs first interactive rows
const audit = await evalJs(`(() => {
  const probes = [
    ['sidebar avatar', '.sidebar-avatar'],
    ['sidebar collapse', '.sidebar-header .icon-btn'],
    ['new chat', '.sidebar-new-chat'],
    ['main header chip', '.main-header .chip-btn'],
  ];
  return JSON.stringify(probes.map(([name, sel]) => {
    const el = document.querySelector(sel);
    if (!el) return name + ': MISSING';
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const inTitlebar = r.y < 36;
    const covered = top && !el.contains(top) && !el.parentElement.contains(top) ? 'COVERED-BY:' + (top.tagName + '.' + top.className).slice(0, 40) : 'clear';
    return name + ': y=' + Math.round(r.y) + ' inTitlebarDragZone=' + inTitlebar + ' ' + covered;
  }));
})()`);
results.push("AUDIT  " + audit);

console.log(results.join("\n"));
console.log("---- RENDER ERRORS (" + errors.length + ") ----");
console.log([...new Set(errors)].slice(0, 8).join("\n").slice(0, 1500));
ws.close();
electron.kill();
process.exit(0);
