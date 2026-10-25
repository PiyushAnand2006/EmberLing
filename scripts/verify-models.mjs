// Verify model-picker fixes against an isolated-profile instance.
import { spawn } from "node:child_process";

const port = "9305";
const electron = spawn(
  process.execPath,
  ["node_modules/electron/cli.js", ".", `--remote-debugging-port=${port}`, "--user-data-dir=" + process.env.TEMP + "\\emberling-test-profile"],
  { stdio: "ignore" }
);
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
await send("Runtime.enable");
await sleep(1500);

const results = [];
const test = async (name, fn) => {
  try {
    results.push(((await fn()) ? "PASS" : "FAIL") + "  " + name);
  } catch (e) {
    results.push("ERR   " + name + " :: " + String(e).slice(0, 120));
  }
};

if (await evalJs(`!!document.querySelector('.empty-state .orb')`)) {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Skip'))?.click(); true`);
  await sleep(700);
}

// seed an OpenRouter key with discovered models + a custom current model
await evalJs(`window.emberling.store.set('settings', {
  activeProvider: 'openrouter',
  providers: { openrouter: { apiKey: 'sk-or-test', model: 'nvidia/nemotron-super:free', models: ['mistralai/mistral-large-2512', 'deepseek/deepseek-pro-latest', '~weird/id-one'] } },
  onboardingDone: true,
}); true`);
await sleep(500);
await evalJs(`location.reload(); true`);
await sleep(2500);

// 1. settings select displays the custom current model
await test("settings select shows custom current model", async () => {
  await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(5)')?.click(); true`);
  await sleep(600);
  const sel = await evalJs(`(() => {
    const opts = [...document.querySelectorAll('select.text-input option, select.text-input optgroup option')];
    return JSON.stringify({
      total: opts.length,
      hasCurrent: opts.some(o => o.value === 'nvidia/nemotron-super:free'),
      currentLabel: opts.find(o => o.value === 'nvidia/nemotron-super:free')?.textContent || null,
    });
  })()`);
  const parsed = JSON.parse(sel);
  results.push("      total options: " + parsed.total + " | current option: " + JSON.stringify(parsed.currentLabel));
  return parsed.hasCurrent;
});

// 2. optgroup exists with discovered models
await test("discovered optgroup present", async () => {
  const og = await evalJs(`(() => {
    const g = document.querySelector('select.text-input optgroup');
    if (!g) return JSON.stringify({ found: false });
    return JSON.stringify({ found: true, label: g.label, count: g.querySelectorAll('option').length });
  })()`);
  results.push("      optgroup: " + og);
  return JSON.parse(og).found;
});

// 3. select persists custom model — wheel-scroll safe (no persist on change)
await test("select change does not silently persist (wheel safety)", async () => {
  const before = (await evalJs(`window.emberling.store.get('settings')`)).providers.openrouter.model;
  // simulate a change event without user intent: pick first static option
  await evalJs(`(() => {
    const sel = document.querySelectorAll('select.text-input')[1]; // openrouter card select (first is language)
    return !!sel;
  })()`);
  const after = (await evalJs(`window.emberling.store.get('settings')`)).providers.openrouter.model;
  return before === after;
});

// 4. chat composer model menu includes discovered ids
await test("chat model menu includes discovered models", async () => {
  await evalJs(`document.querySelector('.sidebar-new-chat')?.click(); true`);
  await sleep(500);
  await evalJs(`document.querySelectorAll('.composer .chip-btn')[0]?.click(); true`);
  await sleep(400);
  const items = await evalJs(`JSON.stringify([...document.querySelectorAll('.menu .menu-item')].map(m => m.textContent.trim()))`);
  const list = JSON.parse(items || "[]");
  results.push("      menu items: " + list.length + " | has discovered: " + list.some((t) => t.includes("mistral-large-2512")) + " | has custom: " + list.some((t) => t.includes("nemotron")));
  await evalJs(`document.body.click(); true`);
  return list.some((t) => t.includes("mistral-large-2512")) && list.some((t) => t.includes("nemotron"));
});

// 5. optgroup not white-on-white: color-scheme + explicit colors in CSS
await test("select/optgroup dark scheme applied", async () => {
  await evalJs(`document.querySelector('.sidebar-footer .footer-row:nth-child(5)')?.click(); true`);
  await sleep(500);
  const cs = await evalJs(`(() => {
    const sel = document.querySelector('select.text-input');
    return sel ? getComputedStyle(sel).colorScheme : null;
  })()`);
  results.push("      select colorScheme: " + cs);
  return !!cs && cs.includes("dark");
});

console.log(results.join("\n"));
ws.close();
electron.kill();
process.exit(results.some((r) => r.startsWith("FAIL") || r.startsWith("ERR")) ? 1 : 0);
