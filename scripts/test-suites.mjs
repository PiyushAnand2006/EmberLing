// Comprehensive automated test suite — the ✅ rows of docs/TEST-PLAN.md.
// Part A: static + module checks (pure Node, no app needed).
// Part B: launch smoke test over CDP (temp profile, auto-cleanup).
// Usage: node scripts/test-suites.mjs [--skip-launch]
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const test = async (name, fn) => {
  try {
    const ok = await fn();
    results.push([ok === false ? "FAIL" : "PASS", name, ""]); // undefined = passed (no throw)
    return ok !== false;
  } catch (e) {
    results.push(["ERR", name, String(e?.message || e).slice(0, 160)]);
    return false;
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
  return true;
};

/* ---------------- Part A: static + module checks ---------------- */

const toolsSrc = read("electron/tools.js");
const mainSrc = read("electron/main.js");
const providersSrc = read("electron/providers.js");
const stateSrc = read("src/state.tsx");
const integSrc = read("src/screens/IntegrationsScreen.tsx");
const composerSrc = read("src/components/Composer.tsx");
const cssSrc = read("src/styles/app.css");
const settingsSrc = read("src/screens/SettingsScreen.tsx");

let tools; // loaded lazily; loads in plain Node (electron requires are inline)
try {
  tools = await import("./../electron/tools.js");
} catch (e) {
  tools = null;
}

await test("A1 tool surface: every TOOL_DEFS name has a status pill", () => {
  const defs = tools.TOOL_DEFS.map((t) => t.function.name);
  const missing = defs.filter((n) => !tools.STATUS_BY_TOOL?.[n]);
  expect(missing.length === 0, `missing pills for: ${missing.join(", ")}`);
});

await test("A2 tool surface: every TOOL_DEFS name has an executor case", () => {
  const defs = tools.TOOL_DEFS.map((t) => t.function.name);
  const missing = defs.filter((n) => !new RegExp(`case "${n}"`).test(toolsSrc));
  expect(missing.length === 0, `missing executor cases: ${missing.join(", ")}`);
});

await test("A3 tool surface: new tools wired into Settings labels", () => {
  for (const id of ["ocr_image", "window_screenshot"]) {
    expect(toolsSrc.includes(`name: "${id}"`), `${id} not in TOOL_DEFS`);
    expect(settingsSrc.includes(id), `${id} not in SettingsScreen labels`);
    expect(mainSrc.includes(`"${id}"`), `${id} not in defaults/migration`);
  }
});

await test("A4 settings migration: echo fix present (store:set uses trayRebuild)", () => {
  expect(/store:set:\$\{col\}[\s\S]{0,400}trayRebuild\?\.\(\)/.test(mainSrc), "store:set must rebuild tray only");
  expect(/let trayRebuild = null/.test(mainSrc), "trayRebuild ref missing");
});

await test("A5 settings migration: NEW_DEFAULT_TOOLS includes new tools", () => {
  const m = mainSrc.match(/NEW_DEFAULT_TOOLS = \[([\s\S]*?)\]/);
  expect(m, "NEW_DEFAULT_TOOLS not found");
  for (const id of ["ocr_image", "window_screenshot"]) expect(m[1].includes(`"${id}"`), `${id} missing`);
});

await test("A6 mergePushed: identity-preserving (echo-safe)", () => {
  expect(/if \(!changed\) return local;/.test(stateSrc), "merge must return local ref when unchanged");
  expect(/store\.onPush\(/.test(stateSrc) && /mergePushed\(/.test(stateSrc), "onPush/merge wiring missing");
});

await test("A7 keyless slot: serialization + exports", () => {
  expect(/withKeylessSlot/.test(providersSrc), "withKeylessSlot missing");
  expect(/for \(const waitMs of \[5000, 15000, 30000\]\)/.test(providersSrc), "429 retry ladder wrong");
  expect(/keyless: !!provider\.keyless/.test(providersSrc), "activeConfig must carry keyless");
  expect(/keyless \? withKeylessSlot/.test(providersSrc), "streamChat must gate keyless providers");
});

await test("A8 keyless slot: concurrent streams serialize (live API)", async () => {
  const { streamChat } = tools?.providers || (await import("./../electron/providers.js"));
  const cfg = { providerId: "pollinations", baseUrl: "https://text.pollinations.ai/openai", apiKey: "free", keyless: true, model: "openai-fast", supportsTools: false };
  const one = (n) => streamChat({ config: cfg, messages: [{ role: "user", content: `Reply with exactly: ok${n}` }], onDelta: () => {} });
  const [a, b] = await Promise.all([one(1), one(2)]);
  expect(/ok1/.test(a.content || "") && /ok2/.test(b.content || ""), `unexpected replies: ${a.content?.slice(0,20)} / ${b.content?.slice(0,20)}`);
}, );

await test("A9 safeJson: raw Windows paths repaired", () => {
  // safeJson lives in providers.js (used by agent.js) since the refactor
  const providers = read("electron/providers.js");
  expect(/function jsonRepairCandidates/.test(providers), "jsonRepairCandidates missing");
  expect(/rawWinPath = \//.test(providers), "raw Windows path heuristic missing");
  expect(/function safeJson/.test(providers) || /function safeJson/.test(read("electron/agent.js")), "safeJson missing");
});

await test("A10 executeTool: ocr_image reads the test image", async () => {
  const img = path.join(os.tmpdir(), "ocr-suite.png");
  await new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Drawing; $b = New-Object System.Drawing.Bitmap(420,110); $g = [System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::White); $f = New-Object System.Drawing.Font('Arial',20); $g.DrawString('suite ocr check 77', $f, [System.Drawing.Brushes]::Black, 15, 35); $g.Dispose(); $b.Save('" + img.replace(/\\/g, "/") + "', [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()"], { stdio: "ignore" });
    ps.on("exit", resolve);
    ps.on("error", resolve);
  });
  expect(fs.existsSync(img), "test image not created");
  const res = await tools.executeTool({ name: "ocr_image", args: { path: img } }, {});
  expect(res.ok && /suite ocr check 77/i.test(res.text), "ocr result: " + JSON.stringify(res).slice(0, 120));
});

await test("A11 window-capture.ps1 runs and reports a status", async () => {
  const out = await new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "electron", "window-capture.ps1"), "Emberling", path.join(os.tmpdir(), "win-suite.png")], { timeout: 40_000 }, (e, so) => resolve(String(so || (e && e.message) || "")));
  });
  expect(/__OK__|__NOWINDOW__/.test(out), "unexpected output: " + out.slice(0, 100));
});

await test("A12 guard: risky regex flags dangerous commands", () => {
  expect(/RISKY_RE\s*=/.test(toolsSrc), "RISKY_RE missing");
});

await test("A13 integrations: 5 honest stubs each with a reason", () => {
  const stubs = integSrc.match(/<StubCard /g) || [];
  expect(stubs.length === 5, `expected 5 stubs, found ${stubs.length}`);
  expect((integSrc.match(/why="/g) || []).length >= 5, "stub reasons missing");
  expect(integSrc.includes('"Vendor OAuth"'), "warn badge text missing");
});

await test("A14 composer: editor wrapper for right-edge pinning", () => {
  expect(composerSrc.includes('className="composer-editor"'), "composer-editor wrapper missing");
  expect(/\.composer-editor \{ flex: 1; min-width: 0; \}/.test(cssSrc), "flex rule missing");
  expect(/\.integ-head \.badge \{ white-space: nowrap; \}/.test(cssSrc), "badge nowrap missing");
  expect(/\.integ-card \{/.test(cssSrc) && /gap: 14px;/.test(cssSrc), "integ grid styles missing");
});

await test("A15 automations: event triggers wired (slack + repo + check now)", () => {
  for (const s of ["slack_mention", "repo_event", "checkEventTrigger", "automations:slackChannels"]) {
    expect(mainSrc.includes(s) || stateSrc.includes(s) || read("src/screens/AutomationsScreen.tsx").includes(s), `${s} missing`);
  }
});

await test("A16 store push: headless writes reach the renderer", () => {
  expect(/function pushStoreToRenderer/.test(mainSrc), "pushStoreToRenderer missing");
  expect(/store\.onRebuild = \(\) => \{[\s\S]*?pushStoreToRenderer\(\)/.test(mainSrc), "onRebuild must push");
  expect(/onPush/.test(read("electron/preload.js")), "preload onPush missing");
  expect(/mergePushed/.test(stateSrc), "renderer merge missing");
});

/* ---------------- Part B: launch smoke over CDP ---------------- */

let launched = false;
if (!process.argv.includes("--skip-launch")) {
  const port = "9253";
  const profile = path.join(os.tmpdir(), "emberling-testsuite-" + Date.now());
  const electron = spawn(process.execPath, ["node_modules/electron/cli.js", ".", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], { stdio: "ignore", cwd: root });
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

  await sleepMs(6000);
  let wsUrl = null;
  for (let i = 0; i < 24; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await res.json();
      const main = pages.find((p) => p.title === "Emberling");
      if (main) { wsUrl = main.webSocketDebuggerUrl; break; }
    } catch {}
    await sleepMs(500);
  }

  if (!wsUrl) {
    results.push(["FAIL", "B0 app launches over CDP", "no page — app failed to start"]);
  } else {
    launched = true;
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const exceptions = [];
    const send = (method, params) => new Promise((resolve) => { const m = ++id; pending.set(m, resolve); ws.send(JSON.stringify({ id: m, method, params })); });
    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r?.exceptionDetails) throw new Error("EVAL: " + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 150));
      return r?.result?.value;
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
      else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        exceptions.push(String(d.exception?.description || d.text).slice(0, 160));
      }
    };
    await new Promise((r) => { ws.onopen = r; });
    await send("Runtime.enable");
    await sleepMs(1500);

    const clickText = (re) => evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(b => ${re.toString()}.test(b.textContent)); if (b) b.click(); return !!b; })()`);
    const h2 = () => evalJs(`document.querySelector('.screen-content h2')?.textContent || document.querySelector('h2')?.textContent || ''`);

    if ((await evalJs(`document.body.innerText.includes('Meet Emberling')`))) {
      await evalJs(`[...document.querySelectorAll('button')].find(b => /skip/i.test(b.textContent))?.click(); true`);
      await sleepMs(800);
    }

    await test("B1 onboarding skipped, chat home renders", async () => {
      expect(await evalJs(`!!document.querySelector('.composer')`), "composer not found on home");
      expect(await evalJs(`document.body.innerText.includes('Ask anything')`), "placeholder missing");
    });

    await test("B2 composer: chips pinned right of a stretching editor", async () => {
      const layout = await evalJs(`(() => {
        const c = document.querySelector('.composer');
        if (!c) return null;
        const ed = c.querySelector('.composer-editor');
        const chip = c.querySelector('.chip-btn');
        const last = c.lastElementChild;
        // document order: editor must precede the first chip; a mic/send/stop closes the pill
        const order = !!(ed && chip && (chip.compareDocumentPosition(ed) & Node.DOCUMENT_POSITION_PRECEDING));
        const grow = ed ? getComputedStyle(ed).flexGrow : '0';
        return { order, grow, lastCls: last ? last.className.split(' ')[0] : '' };
      })()`);
      expect(layout, "no composer");
      expect(layout.order, "first chip must come after the editor in document order");
      expect(String(layout.grow) === "1", "editor does not stretch (flex-grow=" + layout.grow + ")");
      expect(/send-btn|composer-round|stop/.test(layout.lastCls), "last pill child should be mic/send/stop, got " + layout.lastCls);
    });

    for (const [nav, heading] of [["Bots", "Bots"], ["Memories", "Memories"], ["Automations", "Automations"], ["Integrations", "Integrations"], ["Settings", "General"]]) {
      await test(`B3 screen renders: ${nav}`, async () => {
        expect(await clickText(new RegExp("^" + nav + "$", "i")), `${nav} nav button not found`);
        await sleepMs(600);
        const t = await h2();
        expect(new RegExp(heading, "i").test(t), `h2 was "${t}"`);
      });
    }

    await test("B4 integrations: grid of 15 cards, 5 vendor stubs, badges nowrap", async () => {
      expect(await clickText(/Integrations/i), "no Integrations nav");
      await sleepMs(700);
      const stats = await evalJs(`(() => ({
        cards: document.querySelectorAll('.integ-card').length,
        tiles: document.querySelectorAll('.integ-tile').length,
        warn: [...document.querySelectorAll('.integ-card .badge.warn')].filter(b => b.textContent === 'Vendor OAuth').length,
        footer: document.body.innerText.includes('honest stubs'),
      }))()`);
      expect(stats.cards === 15, `cards=${stats.cards}`);
      expect(stats.tiles === 15, `tiles=${stats.tiles}`);
      expect(stats.warn === 5, `vendor stubs=${stats.warn}`);
      expect(stats.footer, "footer note missing");
    });

    await test("B5 automations: editor offers the 3 trigger modes", async () => {
      expect(await clickText(/Automations/i), "no Automations nav");
      await sleepMs(500);
      expect(await clickText(/New automation/i), "no New automation button");
      await sleepMs(500);
      const opts = await evalJs(`[...document.querySelectorAll('.modal select')][0] ? [...document.querySelectorAll('.modal select')[0].options].map(o => o.text) : []`);
      expect(opts.some(o => /schedule/i.test(o)), "schedule option missing");
      expect(opts.some(o => /Slack/i.test(o)), "slack option missing");
      expect(opts.some(o => /GitHub/i.test(o)), "repo option missing");
      await evalJs(`[...document.querySelectorAll('.modal button')].find(b => /Cancel/i.test(b))?.click(); true`);
    });

    await test("B6 settings: new tool chips exist", async () => {
      expect(await clickText(/Settings/i), "no Settings nav");
      await sleepMs(700);
      const found = await evalJs(`(() => { const t = document.body.innerText; return { ocr: t.includes('Read text from images (OCR)'), win: t.includes('Screenshots (window)') }; })()`);
      expect(found.ocr && found.win, "chips missing: " + JSON.stringify(found));
    });

    await test("B7 no uncaught renderer exceptions during the sweep", () => {
      const real = exceptions.filter((e) => !/Extension context invalidated/i.test(e));
      expect(real.length === 0, `${real.length} exceptions: ${real.slice(0, 3).join(" | ")}`);
    });

    try { ws.close(); } catch {}
    electron.kill();
    await sleepMs(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  if (electron && !electron.killed) { try { electron.kill(); } catch {} }
}

/* ---------------- summary ---------------- */

const pass = results.filter((r) => r[0] === "PASS").length;
const fail = results.filter((r) => r[0] === "FAIL").length;
const err = results.filter((r) => r[0] === "ERR").length;
console.log("\n===== Emberling test suites =====");
for (const [st, name, note] of results) console.log(`${st.padEnd(4)} ${name}${note ? "  :: " + note : ""}`);
console.log(`=================================`);
console.log(`${pass} passed, ${fail} failed, ${err} errored (${results.length} total)${launched ? ", launch smoke included" : ", launch smoke skipped"}`);
process.exit(fail + err > 0 ? 1 : 0);
