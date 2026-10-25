// Capture one chat-with-agent screenshot for the README (seeds a demo turn).
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const port = "9291";
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

  await send("Runtime.evaluate", { expression: `document.querySelector('.composer-input')?.focus(); true` });
  await send("Input.insertText", { text: "Search the web for Emberling AI agent and reply with one short paragraph plus a mermaid diagram of its architecture" });
  await sleep(300);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });

  for (let i = 0; i < 150; i++) {
    await sleep(1000);
    const done = await evalJs(`!document.querySelector('.bubble.pending') && document.querySelectorAll('.bubble').length >= 2`);
    if (done) break;
  }
  await sleep(4000);
  try {
    await send("Page.bringToFront");
  } catch {}
  await sleep(450);
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("docs/screenshots/02-chat-conversation.png", Buffer.from(s.data, "base64"));
  console.log("saved 02-chat-conversation.png");
  ws.close();
  electron.kill();
  process.exit(0);
})();
