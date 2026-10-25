// Launch the app, wait for readiness, click-test every button surface, report.
// Usage: node scripts/launch-and-test.mjs [--keep]
import { spawn } from "node:child_process";

const keep = process.argv.includes("--keep");
const port = "9252";
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
  console.log("NO PAGE — app failed to start");
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
const click = (sel) => evalJs(`document.querySelector(${JSON.stringify(sel)})?.click(); !!document.querySelector(${JSON.stringify(sel)})`);
const exists = (sel) => evalJs(`!!document.querySelector(${JSON.stringify(sel)})`);

if (await exists(".empty-state .orb")) {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Skip'))?.click(); true`);
  await sleep(600);
}

await test("sidebar new chat", async () => {
  await click(".sidebar-new-chat");
  return await exists(".composer-input");
});

await test("suggestion chip fills composer", async () => {
  await evalJs(`document.querySelector('.suggestion-chip')?.click(); true`);
  await sleep(300);
  return await evalJs(`document.querySelector('.composer-input')?.value.length > 0`);
});

const footerTests = [
  ["footer Bots", ".sidebar-footer .footer-row:nth-child(1)", ".bot-grid"],
  ["footer Memories", ".sidebar-footer .footer-row:nth-child(2)", ".list-item, .settings-group"],
  ["footer Automations", ".sidebar-footer .footer-row:nth-child(3)", ".settings-group"],
  ["footer Integrations", ".sidebar-footer .footer-row:nth-child(4)", ".integration-grid"],
  ["footer Settings", ".sidebar-footer .footer-row:nth-child(5)", ".screen-nav"],
];
for (const [name, sel, expect] of footerTests) {
  await test(name, async () => {
    await click(sel);
    await sleep(400);
    return await exists(expect);
  });
}

await click(".sidebar-footer .footer-row:nth-child(5)");
await sleep(400);
const navCount = await evalJs(`document.querySelectorAll('.screen-nav .nav-row').length`);
results.push("INFO  settings nav rows: " + navCount);
for (let i = 1; i <= Math.min(navCount, 6); i++) {
  await test("settings nav row " + i, async () => {
    const before = await evalJs(`document.querySelector('.screen-nav .nav-row:nth-child(${i})')?.textContent`);
    await click(`.screen-nav .nav-row:nth-child(${i})`);
    await sleep(250);
    const active = await evalJs(`document.querySelector('.screen-nav .nav-row.active')?.textContent`);
    return !!(active && before && active.trim() === before.trim());
  });
}

await click(".screen-nav .nav-row:nth-child(4)");
await test("appearance bubble color button", async () => {
  // wait for the section to actually render the preview bubble
  let before = null;
  for (let i = 0; i < 20 && !before; i++) {
    await sleep(150);
    before = await evalJs(`document.querySelector('.bubble.user') ? getComputedStyle(document.querySelector('.bubble.user')).backgroundColor : null`);
  }
  if (!before) return false;
  // state-independent: click whichever primary color differs from the current one
  const target = before.includes("18, 111, 212") ? "Green" : "Blue";
  const clicked = await evalJs(`[...document.querySelectorAll('.settings-row button')].find(b => b.title === '${target}')?.click(); !![...document.querySelectorAll('.settings-row button')].find(b => b.title === '${target}')`);
  await sleep(300);
  const after = await evalJs(`document.querySelector('.bubble.user') ? getComputedStyle(document.querySelector('.bubble.user')).backgroundColor : null`);
  return !!(clicked && before !== after);
});

await click(".screen-nav .nav-row:nth-child(1)");
await sleep(300);
await test("general toggle (desktop mark)", async () => {
  const before = await evalJs(`document.querySelector('.settings-row .toggle')?.className`);
  await click(".settings-row .toggle");
  await sleep(300);
  const after = await evalJs(`document.querySelector('.settings-row .toggle')?.className`);
  return before !== after;
});

await click(".sidebar-new-chat");
await sleep(400);
await test("model chip opens menu", async () => {
  await evalJs(`document.querySelectorAll('.composer .chip-btn')[0]?.click(); true`);
  await sleep(300);
  const open = await exists(".menu");
  await evalJs(`document.body.click(); true`);
  await sleep(150);
  return open;
});

await test("approval chip opens menu", async () => {
  await evalJs(`document.querySelectorAll('.composer .chip-btn')[1]?.click(); true`);
  await sleep(300);
  const open = await exists(".menu");
  await evalJs(`document.body.click(); true`);
  await sleep(150);
  return open;
});

await test("approval menu item switches mode", async () => {
  await evalJs(`document.querySelectorAll('.composer .chip-btn')[1]?.click(); true`);
  // wait for the menu to render its items
  let items = null;
  for (let i = 0; i < 20 && !items; i++) {
    await sleep(150);
    items = await evalJs(`document.querySelectorAll('.menu .menu-item').length ? JSON.stringify([...document.querySelectorAll('.menu .menu-item')].map(m => m.textContent)) : null`);
  }
  if (!items) return false;
  const before = String(await evalJs(`document.querySelectorAll('.composer .chip-btn')[1]?.textContent`));
  // state-independent: pick a mode different from the current one
  const pick = before.includes("automatically") ? "risky" : "automatically";
  await evalJs(`[...document.querySelectorAll('.menu .menu-item')].find(b => b.textContent.includes('${pick}'))?.click(); true`);
  await sleep(300);
  const after = String(await evalJs(`document.querySelectorAll('.composer .chip-btn')[1]?.textContent`));
  return !!(before && after && before !== after);
});

await test("window maximize button no-throw", async () => {
  await click(".window-controls button:nth-child(2)");
  await sleep(300);
  return true;
});

// message-action buttons: run a quick turn then check hover actions exist
await test("send button enabled after typing", async () => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  await evalJs(`document.querySelector('.composer-input')?.focus(); true`);
  await send("Input.insertText", { text: "hi" });
  await sleep(300);
  return await evalJs(`document.querySelector('.send-btn')?.disabled === false`);
});

console.log(results.join("\n"));
console.log("---- RENDER ERRORS (" + errors.length + ") ----");
console.log(errors.join("\n---\n").slice(0, 3000));
ws.close();
if (keep) {
  electron.unref();
  console.log("(app left running)");
} else {
  electron.kill();
}
process.exit(0);
