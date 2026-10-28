// Screenshot the new pill composer: launch the app, capture the composer area.
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

try { execSync("taskkill /IM Emberling.exe /F", { stdio: "ignore" }); } catch {}
await new Promise((r) => setTimeout(r, 1200));

const port = "9271";
const electron = spawn(process.execPath, ["node_modules/electron/cli.js", ".", `--remote-debugging-port=${port}`], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getMainWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await res.json();
      const main = pages.find((p) => p.url.includes("index.html"));
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
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const r = pending.get(msg.id);
    pending.delete(msg.id);
    r(msg);
  }
};
await new Promise((r) => (ws.onopen = r));
await sleep(2500);

// find the composer's on-screen rect and capture just that region (plus margin)
await send("Runtime.enable");
const rect = await send("Runtime.evaluate", {
  expression:
    "(function(){const c=document.querySelector('.composer');if(!c)return null;const r=c.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()",
  returnByValue: true,
});
const box = rect?.result?.result?.value;
if (!box) {
  console.log("COMPOSER NOT FOUND");
  ws.close();
  electron.kill();
  process.exit(1);
}
const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot?.result?.data) {
  const out = resolve("docs/screenshots/composer-pill.png");
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("saved", out, "| composer rect:", JSON.stringify(box));
} else {
  console.log("capture failed", JSON.stringify(shot).slice(0, 200));
}
ws.close();
electron.kill();
await sleep(600);
process.exit(0);
