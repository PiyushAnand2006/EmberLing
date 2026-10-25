// Capture the bot creation modal (New Bot) with fields filled in.
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const port = "9293";
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

(async () => {
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

  if (await evalJs(`!!document.querySelector('.empty-state .orb')`)) {
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Skip'))?.click(); true`);
    await sleep(700);
  }

  // open Bots screen, then the New Bot modal
  await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(1)')?.click(); true`);
  await sleep(500);
  await evalJs(`[...document.querySelectorAll('.bot-card')].find(c => c.textContent.includes('New Bot'))?.click(); true`);
  await sleep(500);

  // fill the editor so the shot is lively: name, description, instructions
  const setVal = (sel, text) => evalJs(`(() => {
    const el = document.querySelector('${sel}');
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '${text.replace(/'/g, "\\'")}');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await setVal('.modal input[placeholder="Bot name"]', "Scout");
  await setVal('.modal input[placeholder="Short description"]', "Researches the web and writes tight briefings");
  await setVal('.modal textarea[placeholder*="research assistant"]', "You are Scout. Research topics across the web and reply with a short, well-structured briefing with sources.");
  await sleep(600);

  try {
    await send("Page.bringToFront");
  } catch {}
  await sleep(450);
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("docs/screenshots/08-bot-editor-publish.png", Buffer.from(s.data, "base64"));
  console.log("saved 08-bot-editor-publish.png (creation modal)");
  ws.close();
  electron.kill();
  process.exit(0);
})();
