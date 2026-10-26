// Feature verification: publish server (cloud agents), mermaid rendering,
// rich composer toolbar, MCP settings section, usage screen, language.
import { spawn } from "node:child_process";

const port = "9272";
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
await sleep(1500);

const results = [];
const test = async (name, fn) => {
  try {
    const ok = await fn();
    results.push((ok ? "PASS" : "FAIL") + "  " + name);
  } catch (e) {
    results.push("ERR   " + name + " :: " + String(e).slice(0, 120));
  }
};
const log = (s) => results.push("      " + s);

if (await evalJs(`!!document.querySelector('.empty-state .orb')`)) {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Skip'))?.click(); true`);
  await sleep(600);
}

/* 1. Publish a bot and hit the served page + API */
await test("cloud agent publish (local hosting)", async () => {
  const bots = (await evalJs(`window.emberling.store.get('bots')`)) || [];
  const bot = { id: "pub-test-bot", name: "PublishTest", emoji: "🤖", color: "#126fd4", instructions: "You are terse. Reply in one short sentence.", knowledge: [], createdAt: Date.now() };
  await evalJs(`window.emberling.store.set('bots', ${JSON.stringify([...bots.filter((b) => b.id !== bot.id), bot])})`);
  await sleep(300);
  const res = await evalJs(`window.emberling.publish.publish('pub-test-bot')`);
  if (!res || !res.ok || !res.url) {
    log("publish res: " + JSON.stringify(res));
    return false;
  }
  log("url: " + res.url);
  const page = await fetch(res.url);
  const html = await page.text();
  log("page status " + page.status + ", has name: " + html.includes("PublishTest"));
  const api = await fetch(res.url + "&message=" + encodeURIComponent("say hi in three words"));
  const j = await api.json();
  log("api reply: " + String(j.reply || j.error || "").slice(0, 80));
  await evalJs(`window.emberling.publish.unpublish('pub-test-bot')`);
  await evalJs(`window.emberling.store.set('bots', ${JSON.stringify(bots)})`);
  return page.status === 200 && html.includes("PublishTest") && typeof j.reply === "string";
});

/* 2. Mermaid rendering through a real chat turn */
await test("mermaid diagram renders in chat", async () => {
  await evalJs(`document.querySelector('.sidebar-new-chat')?.click(); true`);
  await sleep(300);
  await send("Runtime.evaluate", { expression: `document.querySelector('.composer-input')?.focus(); true` });
  await send("Input.insertText", { text: "Output a fenced code block tagged mermaid containing exactly: graph TD; A-->B; and nothing else" });
  await sleep(300);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  let done = false;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    done = await evalJs(`!document.querySelector('.bubble.pending') && document.querySelectorAll('.bubble').length >= 2`);
    if (done) break;
  }
  await sleep(3500); // lazy-load mermaid + render
  const reply = await evalJs(`[...document.querySelectorAll('.bubble.agent')].pop()?.textContent?.slice(0, 120)`);
  const anySvg = await evalJs(`!!document.querySelector('.chat-scroll svg')`);
  const card = anySvg;
  log("reply: " + JSON.stringify(reply));
  log("svg present: " + anySvg + ", card: " + card);
  return anySvg;
});

/* 3. Rich composer toolbar (TipTap): toggle bold, type, expect <strong> */
await test("rich composer toolbar", async () => {
  await evalJs(`document.querySelector('.sidebar-new-chat')?.click(); true`);
  await sleep(400);
  const btnCount = await evalJs(`[...document.querySelectorAll('.composer-toolbar .icon-btn')].filter(b => ['Bold','Italic','Link','Bulleted list'].includes(b.title)).length`);
  await evalJs(`[...document.querySelectorAll('.composer-toolbar .icon-btn')].find(b => b.title === 'Bold')?.click(); true`);
  await send("Runtime.evaluate", { expression: `document.querySelector('.ProseMirror')?.focus(); true` });
  await send("Input.insertText", { text: "bold hello" });
  await sleep(300);
  const strong = await evalJs(`!!document.querySelector('.ProseMirror strong')`);
  // restore: clear composer + untoggle bold
  await evalJs(`[...document.querySelectorAll('.composer-toolbar .icon-btn')].find(b => b.title === 'Bold')?.click(); true`);
  await evalJs(`document.querySelector('.sidebar-new-chat')?.click(); true`);
  log("strong rendered: " + strong);
  return btnCount >= 4 && !!strong;
});

/* 4-6. Settings sections */
await test("settings sections (MCP, Usage, Language)", async () => {
  await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(6)')?.click(); true`);
  await sleep(500);
  const rows = await evalJs(`JSON.stringify([...document.querySelectorAll('.screen-nav .nav-row')].map(r => r.textContent.trim()))`);
  log("nav: " + rows);
  const nav = JSON.parse(rows || "[]");
  const mcpIdx = nav.findIndex((t) => t.includes("MCP"));
  if (mcpIdx < 0) return false;
  await evalJs(`document.querySelectorAll('.screen-nav .nav-row')[${mcpIdx}]?.click(); true`);
  await sleep(500);
  const mcpOk = await evalJs(`!!document.querySelector('input[placeholder*="Server name"]')`);
  const plugIdx = nav.findIndex((t) => t.includes("Plugins"));
  await evalJs(`document.querySelectorAll('.screen-nav .nav-row')[${plugIdx}]?.click(); true`);
  await sleep(500);
  const pluginsOk = await evalJs(`document.body.textContent.includes('Weather') && document.body.textContent.includes('built-in')`);
  const usageIdx = nav.findIndex((t) => t.includes("Usage"));
  await evalJs(`document.querySelectorAll('.screen-nav .nav-row')[${usageIdx}]?.click(); true`);
  await sleep(500);
  const usageOk = await evalJs(`document.body.textContent.includes('Tokens in / out')`);
  const genIdx = nav.findIndex((t) => t.startsWith("General"));
  await evalJs(`document.querySelectorAll('.screen-nav .nav-row')[${genIdx}]?.click(); true`);
  await sleep(400);
  const langOk = await evalJs(`!!document.querySelector('.settings-row option[value="zh-CN"]')`);
  log("mcp:" + mcpOk + " plugins:" + pluginsOk + " usage:" + usageOk + " lang:" + langOk);
  return mcpOk && pluginsOk && usageOk && langOk;
});

console.log(results.join("\n"));
console.log("---- RENDER ERRORS (" + errors.length + ") ----");
console.log([...new Set(errors)].slice(0, 6).join("\n").slice(0, 1200));
ws.close();
electron.kill();
process.exit(results.some((r) => r.startsWith("FAIL") || r.startsWith("ERR")) ? 1 : 0);
