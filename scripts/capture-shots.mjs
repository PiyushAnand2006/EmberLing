// Capture README screenshots of the running app via CDP.
import { spawn } from "node:child_process";
import fs from "node:fs";

const port = "9290";
const outDir = new URL("../docs/screenshots/", import.meta.url).pathname.replace(/^\//, "").replace(/\//g, "\\");
fs.mkdirSync(outDir, { recursive: true });

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
  }
};
await new Promise((r) => {
  ws.onopen = r;
});
await send("Page.enable");
await send("Runtime.enable");
await sleep(1500);

const shot = async (name) => {
  try {
    await send("Page.bringToFront");
  } catch {}
  await sleep(450);
  const s = await send("Page.captureScreenshot", { format: "png" });
  const p = outDir + name;
  fs.writeFileSync(p, Buffer.from(s.data, "base64"));
  console.log("saved", name);
};

if (await evalJs(`!!document.querySelector('.empty-state .orb')`)) {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Skip'))?.click(); true`);
  await sleep(700);
}

// 1. Empty chat / greeting
await evalJs(`document.querySelector('.sidebar-new-chat')?.click(); true`);
await sleep(500);
await shot("01-chat-empty.png");

// 2. A real conversation (open an existing one with content)
const convs = await evalJs(`(await window.emberling.store.get('conversations')).filter(c => c.messages.some(m => m.content && m.role === 'assistant')).length`);
if (convs > 0) {
  await evalJs(`(async () => {
    const cs = (await window.emberling.store.get('conversations')).filter(c => c.messages.some(m => m.content && m.role === 'assistant'));
    window.dispatchEvent(new CustomEvent('navigate-open', { detail: cs[0].id }));
    return true;
  })()`);
  // click the newest conversation row with content instead
  await evalJs(`document.querySelector('.conv-item')?.click(); true`);
  await sleep(700);
  const hasAgent = await evalJs(`document.querySelectorAll('.bubble.agent').length > 0`);
  if (!hasAgent) {
    // last resort: find a conversation row whose title suggests content
    await evalJs(`[...document.querySelectorAll('.conv-item')].pop()?.click(); true`);
    await sleep(700);
  }
  await shot("02-chat-conversation.png");
}

// 3. Settings — General (providers)
await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(5)')?.click(); true`);
await sleep(500);
await shot("03-settings-general.png");

// 4. Settings — MCP servers
await evalJs(`[...document.querySelectorAll('.screen-nav .nav-row')].find(r => r.textContent.includes('MCP'))?.click(); true`);
await sleep(500);
await shot("04-settings-mcp.png");

// 5. Settings — Usage
await evalJs(`[...document.querySelectorAll('.screen-nav .nav-row')].find(r => r.textContent.includes('Usage'))?.click(); true`);
await sleep(500);
await shot("05-settings-usage.png");

// 6. Appearance (bubble colors)
await evalJs(`[...document.querySelectorAll('.screen-nav .nav-row')].find(r => r.textContent.includes('Appearance'))?.click(); true`);
await sleep(500);
await shot("06-appearance.png");

// 7. Bots screen
await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(1)')?.click(); true`);
await sleep(500);
await shot("07-bots.png");

// 8. Bot editor with publish controls (open first bot edit)
const hasBot = await evalJs(`document.querySelectorAll('.bot-card').length > 1`);
if (hasBot) {
  await evalJs(`[...document.querySelectorAll('.bot-card')].find(c => c.textContent.includes('Edit'))?.querySelector('button[title=Edit]')?.click(); true`);
  await sleep(500);
  await shot("08-bot-editor-publish.png");
  await evalJs(`document.querySelector('.modal-backdrop')?.click(); true`);
  await sleep(300);
}

// 9. Automations
await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(3)')?.click(); true`);
await sleep(500);
await shot("09-automations.png");

// 10. Integrations
await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(4)')?.click(); true`);
await sleep(500);
await shot("10-integrations.png");

// 11. Memories
await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(2)')?.click(); true`);
await sleep(500);
await shot("11-memories.png");

console.log("DONE");
ws.close();
electron.kill();
process.exit(0);
