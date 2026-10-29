// Reproduce the bot-chat tool failures: send a research prompt to JIMI's
// conversation and capture every agent event, especially toolResult errors.
import { spawn, execSync } from "node:child_process";

try { execSync('taskkill /IM Emberling.exe /F', { stdio: "ignore" }); } catch {}
try { execSync('taskkill /IM electron.exe /F', { stdio: "ignore" }); } catch {}
await new Promise((r) => setTimeout(r, 1500));

const electron = spawn(process.execPath, ["node_modules/electron/cli.js", ".", "--remote-debugging-port=9287"], { stdio: ["ignore", "ignore", "pipe"] });
let mainErr = "";
electron.stderr?.on("data", (d) => (mainErr += d.toString()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch("http://127.0.0.1:9287/json/list");
    const pages = await res.json();
    const main = pages.find((p) => p.url.includes("index.html"));
    if (main) { wsUrl = main.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(500);
}
if (!wsUrl) { console.log("NO PAGE"); console.log("stderr:", mainErr.slice(-400)); electron.kill(); process.exit(1); }

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

// install an event recorder that captures every agent event
await send("Runtime.evaluate", {
  expression: `window.__events = []; window.emberling.agent.onEvent((evt) => { if (window.__events.length < 80) window.__events.push(evt); }); 'recording'`,
  returnByValue: true,
});

// find JIMI's bot + a conversation bound to it
const setup = await send("Runtime.evaluate", {
  expression: `(async function(){
    const bots = await window.emberling.store.get('bots');
    const bot = bots.find((b) => b.name === 'JIMI');
    if (!bot) return JSON.stringify({ error: 'no JIMI' });
    const convs = await window.emberling.store.get('conversations');
    let conv = convs.filter((c) => c.botId === bot.id).sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0))[0];
    if (!conv) { conv = { id: 'rea-jimi-' + Date.now(), title: bot.name, messages: [], botId: bot.id }; }
    return JSON.stringify({ botId: bot.id, botName: bot.name, convId: conv.id, title: conv.title });
  })()`,
  returnByValue: true,
  awaitPromise: true,
});
const st = JSON.parse(setup.result?.result?.value || "{}");
console.log("setup:", JSON.stringify(st));
if (st.error) { electron.kill(); process.exit(1); }

// send a research prompt through the real path (no room — single bot)
const res = await send("Runtime.evaluate", {
  expression: `window.emberling.agent.send({ conversationId: ${JSON.stringify(st.convId)}, history: [{ role: 'user', content: 'research about sustainable agriculture measures' }], botId: ${JSON.stringify(st.botId)}, mode: 'visible' })`,
  returnByValue: true,
  awaitPromise: true,
});
console.log("send result:", JSON.stringify(res.result?.result?.value || res).slice(0, 300));

// wait for the turn to run and fail, then dump tool events
await sleep(45000);
const ev = await send("Runtime.evaluate", { expression: `JSON.stringify(window.__events)`, returnByValue: true });
const events = JSON.parse(ev.result?.result?.value || "[]");
for (const e of events) {
  if (e.type === "toolCall") console.log("[toolCall]", e.payload?.call?.name, JSON.stringify(e.payload?.call?.args || {}).slice(0, 100));
  if (e.type === "toolResult") console.log("[toolResult]", e.payload?.call?.name, "ok=", e.payload?.result?.ok, "| err:", String(e.payload?.result?.error || e.payload?.result?.stderr || "").slice(0, 160));
  if (e.type === "done") console.log("[done]", JSON.stringify(e.payload || {}).slice(0, 200));
  if (e.type === "status") console.log("[status]", e.payload?.text);
}
ws.close();
electron.kill();
await sleep(600);
process.exit(0);
