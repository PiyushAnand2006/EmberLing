// Reproduce the bot-chat send failure: drive the real app over CDP, call
// agent.send with JIMI's botId, and print the exact error the renderer
// currently swallows.
import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";

try { execSync('taskkill /IM Emberling.exe /F', { stdio: "ignore" }); } catch {}
await new Promise((r) => setTimeout(r, 1200));

const electron = spawn(process.execPath, ["node_modules/electron/cli.js", ".", "--remote-debugging-port=9283"], { stdio: ["ignore", "ignore", "pipe"] });
let mainErr = "";
electron.stderr?.on("data", (d) => (mainErr += d.toString()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch("http://127.0.0.1:9283/json/list");
    const pages = await res.json();
    const main = pages.find((p) => p.url.includes("index.html"));
    if (main) { wsUrl = main.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(500);
}
if (!wsUrl) { console.log("NO PAGE"); console.log("main stderr:", mainErr.slice(-600)); electron.kill(); process.exit(1); }

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

// find JIMI's bot id + one of its conversations from the renderer state
const setup = await send("Runtime.evaluate", {
  expression: `(async function(){
    const bots = await window.emberling.store.get('bots');
    const bot = bots.find((b) => b.name === 'JIMI');
    const convs = await window.emberling.store.get('conversations');
    const conv = convs.find((c) => c.botId === bot?.id) || { id: 'rea-test-' + Date.now(), messages: [], botId: bot?.id || '', title: 'REA test' };
    return JSON.stringify({ botId: bot?.id, convId: conv.id, hasHistory: conv.messages?.length > 0 });
  })()`,
  returnByValue: true,
  awaitPromise: true,
});
console.log("setup:", setup.result?.result?.value);
const { botId, convId } = JSON.parse(setup.result?.result?.value || "{}");
if (!botId) { console.log("JIMI bot not found"); electron.kill(); process.exit(1); }

// call the exact IPC the composer uses
const res = await send("Runtime.evaluate", {
  expression: `window.emberling.agent.send({ conversationId: ${JSON.stringify(convId)}, history: [{ role: 'user', content: 'hi' }], botId: ${JSON.stringify(botId)}, mode: 'visible' })`,
  returnByValue: true,
  awaitPromise: true,
});
console.log("agent.send:", JSON.stringify(res.result?.result?.value || res).slice(0, 600));

// if it failed, the main-process error is our answer; also try default bot for contrast
const res2 = await send("Runtime.evaluate", {
  expression: `window.emberling.agent.send({ conversationId: 'rea-test-default', history: [{ role: 'user', content: 'hi' }], botId: '', mode: 'visible' })`,
  returnByValue: true,
  awaitPromise: true,
});
console.log("agent.send (default bot):", JSON.stringify(res2.result?.result?.value || res2).slice(0, 400));

console.log("main stderr tail:", mainErr.slice(-800) || "(none)");
ws.close();
electron.kill();
await sleep(600);
process.exit(0);
