// Emberling (rebuilt) — Electron main process.
// Mirrors the original's process structure: frameless main chat window,
// tray, desktop-mount orb, agent execution in main, JSON local stores.

const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, dialog, nativeImage, net, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const crypto = require("node:crypto");

const store = require("./store");
const { PROVIDERS, providerById } = require("./providers");
const { runAgentTurn } = require("./agent");

// scheme privileges must be registered before app is ready
require("electron").protocol.registerSchemesAsPrivileged([
  { scheme: "emberling-media", privileges: { stream: true, bypassCSP: false } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  bootstrap();
}

let mainWindow = null;
let orbWindow = null;
let tray = null;
const activeTurns = new Map(); // conversationId -> AbortController
const pendingApprovals = new Map(); // approvalId -> {resolve, request}

function isDev() {
  return !!process.env.VITE_DEV_SERVER_URL;
}

function rendererDir() {
  // dev: vite server; prod: vite build output next to the project root
  return isDev() ? path.join(__dirname, "..") : path.join(__dirname, "..", "renderer-build");
}

function loadRenderer(win, hash) {
  const suffix = hash ? `#${hash}` : "";
  if (isDev()) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}${suffix}`);
  } else {
    win.loadFile(path.join(rendererDir(), "index.html"), hash ? { hash: hash.slice(1) } : undefined);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    backgroundColor: "#141414",
    show: false,
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  loadRenderer(mainWindow);
}

function orbDefaultBounds() {
  // pin to the right edge, vertically centered, inside the primary work area
  const wa = require("electron").screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - 96 - 16, y: wa.y + Math.round(wa.height / 2) - 48 };
}

function createOrbWindow() {
  const settings = { ...defaultSettings(), ...store.load("settings", {}) };
  const wa = require("electron").screen.getPrimaryDisplay().workArea;
  const saved = settings.orbPosition || orbDefaultBounds();
  // clamp into the visible work area so a moved taskbar can't strand the mark
  const x = Math.min(Math.max(saved.x, wa.x), wa.x + wa.width - 96);
  const y = Math.min(Math.max(saved.y, wa.y), wa.y + wa.height - 96);
  orbWindow = new BrowserWindow({
    width: 96,
    height: 96,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  orbWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  orbWindow.setAlwaysOnTop(true, "screen-saver");
  if (isDev()) {
    orbWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/orb.html`);
  } else {
    orbWindow.loadFile(path.join(rendererDir(), "orb.html"));
  }
  orbWindow.on("ready-to-show", () => {
    const settings = store.load("settings", {});
    if (settings.showOrb !== false) orbWindow.show();
  });
  orbWindow.on("closed", () => {
    orbWindow = null;
  });
}

function createTray() {
  const icon = appIcon() ? appIcon().resize({ width: 32, height: 32 }) : nativeImage.createFromDataURL(ORB_ICON_DATAURL);
  tray = new Tray(icon);
  const rebuild = () => {
    const conversations = store.load("conversations", []);
    const recent = conversations.slice(0, 6);
    const template = [
      { label: "New chat", click: () => focusMain("new") },
      { type: "separator" },
      ...recent.map((c) => ({
        label: (c.title || "New chat").slice(0, 40),
        click: () => focusMain(`chat/${c.id}`),
      })),
      { type: "separator" },
      { label: orbVisible() ? "Hide the desktop mark" : "Show the desktop mark", click: () => toggleOrb() },
      { label: "Settings", click: () => focusMain("settings") },
      { type: "separator" },
      { label: "Quit Emberling", click: () => app.quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
    tray.setToolTip("Emberling");
  };
  tray.on("click", () => focusMain());
  rebuild();
  store.onRebuild = rebuild;
  return rebuild;
}

function orbVisible() {
  return !!orbWindow && orbWindow.isVisible();
}

function toggleOrb() {
  if (!orbWindow) return;
  if (orbWindow.isVisible()) orbWindow.hide();
  else orbWindow.show();
  const settings = store.update("settings", (s) => ({ ...defaultSettings(), ...s, showOrb: orbWindow.isVisible() }));
  mainWindow?.webContents.send("settings:push", settings);
}

ipcMain.on("orb:sync", (_e, enabled) => {
  if (!orbWindow) return;
  if (enabled) orbWindow.show();
  else orbWindow.hide();
});

// custom pointer-drag of the desktop mark (the mark itself is the drag surface)
ipcMain.on("orb:move", (_e, { dx, dy }) => {
  if (!orbWindow || typeof dx !== "number" || typeof dy !== "number") return;
  const [x, y] = orbWindow.getPosition();
  orbWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
});

ipcMain.on("orb:save-position", () => {
  if (!orbWindow) return;
  const [x, y] = orbWindow.getPosition();
  store.update("settings", (s) => ({ ...defaultSettings(), ...s, orbPosition: { x, y } }));
});

function focusMain(hash) {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (hash) mainWindow.webContents.send("navigate", hash);
}

function bootstrap() {
  app.on("second-instance", () => focusMain());

  app.whenReady().then(() => {
    registerMediaProtocol();
    createMainWindow();
    createOrbWindow();
    createTray();
    startAutomationScheduler();
    connectSavedMcpServers();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    // keep running in tray like the original menubar agent
  });

  app.on("before-quit", () => {
    require("./mcp").stopAll();
    store.flushNow();
  });
}

// emberling-media://<file> — serves saved attachments/voice memos from userData
function registerMediaProtocol() {
  const { protocol } = require("electron");
  protocol.handle("emberling-media", (request) => {
    const name = decodeURIComponent(request.url.replace(/^emberling-media:\/\//, ""));
    const safe = path.basename(name);
    const file = path.join(mediaDir(), safe);
    return net.fetch(`file://${file.split(path.sep).join("/")}`);
  });
}

function mediaDir() {
  const dir = path.join(app.getPath("userData"), "media");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/* ---------------- IPC: window controls ---------------- */
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());
ipcMain.on("orb:toggle-main", () => focusMain());
ipcMain.on("orb:files-dropped", (_e, files) => {
  focusMain();
  mainWindow?.webContents.send("files-dropped", files);
});

/* ---------------- IPC: stores ---------------- */
const COLLECTIONS = ["conversations", "bots", "memories", "automations", "settings", "integrations", "usage", "mcp"];
for (const col of COLLECTIONS) {
  ipcMain.handle(`store:get:${col}`, () => store.load(col, col === "conversations" ? [] : col === "settings" ? defaultSettings() : {}));
  ipcMain.handle(`store:set:${col}`, (_e, value) => {
    store.update(col, () => value);
    store.onRebuild?.();
    return true;
  });
}

function defaultSettings() {
  return {
    activeProvider: "pollinations",
    providers: {},
    approvalMode: "ask", // ask | askRisky | auto
    agentTools: [
      "run_command", "read_file", "write_file", "edit_file", "list_dir",
      "web_search", "web_fetch", "generate_photo", "generate_video", "screenshot",
      "screen_screenshot", "spawn_subagent", "react_to_message", "request_user_form",
      "send_email", "list_windows", "focus_window", "type_text", "save_memory",
    ],
    bubbleColor: "default",
    notifications: true,
    sounds: true,
    showOrb: true,
    userName: "",
    onboardingDone: false,
    language: "en",
    queueOffline: true,
    plus: false,
    voice: { input: "default", rate: 1 },
  };
}

ipcMain.handle("providers:list", () => PROVIDERS);

ipcMain.handle("providers:fetchModels", async (_e, { providerId, apiKey, baseUrl }) => {
  try {
    const { fetchModels } = require("./providers");
    const models = await fetchModels({ providerId, apiKey, baseUrl });
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("providers:test", async (_e, { providerId, apiKey, baseUrl, model }) => {
  const provider = providerById(providerId);
  if (!provider) return { ok: false, error: "unknown provider" };
  const url = baseUrl || provider.url;
  if (!url) return { ok: false, error: "no base URL" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || provider.models[0]?.id || "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Reply with the word: ok" }],
        max_tokens: 5,
      }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || "";
    return { ok: true, sample: String(text).slice(0, 80) };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/* ---------------- IPC: attachments & media ---------------- */
ipcMain.handle("media:save", async (_e, { name, dataBase64 }) => {
  const ext = path.extname(name) || "";
  const id = `${crypto.randomUUID()}${ext}`;
  await fsp.writeFile(path.join(mediaDir(), id), Buffer.from(dataBase64, "base64"));
  return { id, url: `emberling-media://${id}` };
});

ipcMain.handle("media:readText", async (_e, filePath) => {
  try {
    const stat = await fsp.stat(filePath);
    if (stat.size > 2_000_000) return { ok: false, error: "file too large (max 2 MB)" };
    const content = await fsp.readFile(filePath, "utf8").catch(() => null);
    if (content === null) return { ok: false, error: "binary file — attached as reference only" };
    return { ok: true, content: content.slice(0, 60000), name: path.basename(filePath), size: stat.size };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

ipcMain.handle("dialog:pickFiles", async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ["openFile", "multiSelections"] });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle("dialog:saveExport", async (_e, { defaultPath, content }) => {
  const res = await dialog.showSaveDialog(mainWindow, { defaultPath });
  if (res.canceled || !res.filePath) return false;
  await fsp.writeFile(res.filePath, content, "utf8");
  return true;
});

/* ---------------- IPC: voice ---------------- */
ipcMain.handle("voice:transcribe", async (_e, { mediaId, mimeType }) => {
  const settings = store.load("settings", defaultSettings());
  const { transcribe } = require("./providers");
  try {
    const text = await transcribe({ settings, filePath: path.join(mediaDir(), mediaId), mimeType });
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/* ---------------- IPC: agent turns ---------------- */
ipcMain.handle("agent:send", async (event, { conversationId, history, botId, mode }) => {
  const settings = store.load("settings", defaultSettings());
  const bots = store.load("bots", []);
  const memories = store.load("memories", []);
  const bot = bots.find((b) => b.id === botId) || null;
  const controller = new AbortController();
  activeTurns.set(conversationId, controller);
  const send = (type, payload) => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send("agent:event", { conversationId, type, payload });
    }
  };

  // approval plumbing: ask renderer, await its answer
  const approvals = [];
  const askApproval = (request) =>
    new Promise((resolve) => {
      const id = crypto.randomUUID();
      pendingApprovals.set(id, { resolve });
      approvals.push(id);
      send("approval", { id, ...request });
    });

  const takeScreenshot = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: "no window" };
    const image = await mainWindow.webContents.capturePage();
    const id = `${crypto.randomUUID()}.png`;
    await fsp.writeFile(path.join(mediaDir(), id), image.toPNG());
    return { ok: true, url: `emberling-media://${id}`, note: "Embed with markdown image syntax." };
  };

  const takeScreenScreenshot = async () => {
    const { desktopCapturer } = require("electron");
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1600, height: 900 } });
    const primary = sources[0];
    if (!primary) return { ok: false, error: "no screen source" };
    const id = `${crypto.randomUUID()}.png`;
    await fsp.writeFile(path.join(mediaDir(), id), primary.thumbnail.toPNG());
    return { ok: true, url: `emberling-media://${id}` };
  };

  const saveMemory = async (text) => {
    store.update("memories", (list) => [{ id: crypto.randomUUID(), text, createdAt: Date.now(), source: "agent" }, ...list]);
    send("uiAction", { type: "memory-saved", text });
    return { ok: true, saved: text.slice(0, 80) };
  };

  // subagents: nested research turns with read-only + web tools
  const spawnSubagent = async (goal) => {
    const sub = await runAgentTurn({
      settings,
      history: [{ role: "user", content: `Research task: ${goal}\n\nReturn a concise, factual summary with sources where possible.` }],
      approvalMode: "ask",
      memories: [],
      agentTools: ["web_search", "web_fetch", "read_file", "list_dir", "generate_photo"],
      signal: controller.signal,
      toolContext: {},
      events: { onStatus: () => {}, onDelta: () => {}, onToolCall: () => {}, onToolResult: () => {}, onApprovalRequest: () => Promise.resolve(false) },
    });
    return { ok: true, summary: truncateMain(sub.text, 4000) };
  };

  // user forms: same pending plumbing as approvals but with values
  const requestForm = (form) =>
    new Promise((resolve) => {
      const id = crypto.randomUUID();
      approvals.push(id);
      pendingForms.set(id, { resolve });
      send("form", { id, ...form });
    });

  try {
    const mcp = require("./mcp");
    const mcpDefs = mcp.agentToolDefs();
    const result = await runAgentTurn({
      settings,
      history,
      approvalMode: settings.approvalMode || "ask",
      botInstructions: bot?.instructions || "",
      botKnowledge: bot?.knowledge || [],
      memories,
      agentTools: settings.agentTools,
      signal: controller.signal,
      extraToolDefs: mcpDefs,
      toolContext: {
        takeScreenshot,
        takeScreenScreenshot,
        saveMemory,
        spawnSubagent,
        requestForm,
        uiAction: (action) => send("uiAction", action),
        callMcp: (toolName) => mcp.resolveMcpCall(toolName),
      },
      events: {
        onStatus: (text) => send("status", { text }),
        onDelta: (delta) => send("delta", { delta }),
        onToolCall: (call) => send("toolCall", { call }),
        onToolResult: (call, result) => send("toolResult", { call, result }),
        onApprovalRequest: askApproval,
      },
    });
    // drain any approval/form that was never answered
    for (const id of approvals) {
      pendingApprovals.get(id)?.resolve(false);
      pendingApprovals.delete(id);
      pendingForms.get(id)?.resolve({ approved: false });
      pendingForms.delete(id);
    }
    trackUsage(settings, result?.usage);
    send("done", result);
    notifyTurnDone(settings, mode, result);
    return { ok: true };
  } catch (err) {
    for (const id of approvals) {
      pendingApprovals.get(id)?.resolve(false);
      pendingApprovals.delete(id);
      pendingForms.get(id)?.resolve({ approved: false });
      pendingForms.delete(id);
    }
    if (err?.name === "AbortError") {
      send("done", { text: "", stopped: true });
      return { ok: true, stopped: true };
    }
    send("done", { text: "", error: String(err?.message || err) });
    return { ok: false, error: String(err?.message || err) };
  } finally {
    activeTurns.delete(conversationId);
  }
});

function truncateMain(s, n) {
  return String(s || "").length > n ? String(s).slice(0, n) + "…" : String(s || "");
}

const pendingForms = new Map();
ipcMain.on("form:resolve", (_e, { id, values, approved }) => {
  const pending = pendingForms.get(id);
  pendingForms.delete(id);
  pending?.resolve({ approved: approved !== false, values: values || {} });
});

/* ---------------- Usage tracking (original: usage/billing) ---------------- */
function trackUsage(settings, usage) {
  if (!usage) return;
  const day = new Date().toISOString().slice(0, 10);
  store.update("usage", (list) => {
    const next = Array.isArray(list) ? [...list] : [];
    const row = next.find((u) => u.day === day);
    const entry = {
      day,
      turns: (row?.turns || 0) + 1,
      tokensIn: (row?.tokensIn || 0) + (usage.prompt_tokens || 0),
      tokensOut: (row?.tokensOut || 0) + (usage.completion_tokens || 0),
    };
    const i = next.findIndex((u) => u.day === day);
    if (i >= 0) next[i] = entry;
    else next.push(entry);
    return next.slice(-60);
  });
}

function notifyTurnDone(settings, mode, result) {
  if (!settings.notifications || mode === "visible") return;
  if (Notification.isSupported()) {
    const n = new Notification({ title: "Emberling", body: (result.text || "Finished working").slice(0, 120) });
    n.on("click", () => focusMain());
    n.show();
  }
}

ipcMain.on("agent:stop", (_e, conversationId) => {
  activeTurns.get(conversationId)?.abort();
  activeTurns.delete(conversationId);
});

ipcMain.on("approval:resolve", (_e, { id, approved }) => {
  const pending = pendingApprovals.get(id);
  pendingApprovals.delete(id);
  pending?.resolve(!!approved);
});

/* ---------------- Automations scheduler ---------------- */
let automationTimer = null;
function startAutomationScheduler() {
  if (automationTimer) return;
  automationTimer = setInterval(runDueAutomations, 30_000);
  if (automationTimer.unref) automationTimer.unref();
}

async function runDueAutomations() {
  const automations = store.load("automations", []);
  const now = Date.now();
  for (const a of automations) {
    if (!a.enabled) continue;
    const due = automationDue(a, now);
    if (!due) continue;
    store.update("automations", (list) => list.map((x) => (x.id === a.id ? { ...x, lastRun: now } : x)));
    await runAutomationTurn(a);
  }
}

function automationDue(a, now) {
  if (a.lastRun == null) return a.runImmediately !== false ? true : false;
  if (a.schedule?.type === "minutes") {
    return now - a.lastRun >= (a.schedule.minutes || 60) * 60_000;
  }
  if (a.schedule?.type === "daily") {
    const [h, m] = (a.schedule.time || "09:00").split(":").map(Number);
    const last = new Date(a.lastRun);
    const todayRun = new Date();
    todayRun.setHours(h, m, 0, 0);
    return now >= todayRun.getTime() && last.getTime() < todayRun.getTime();
  }
  return false;
}

async function runAutomationTurn(a) {
  const settings = store.load("settings", defaultSettings());
  const conversations = store.load("conversations", []);
  let conv = conversations.find((c) => c.automationId === a.id);
  if (!conv) {
    conv = {
      id: crypto.randomUUID(),
      title: a.name,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      automationId: a.id,
      unread: 0,
      muted: false,
      pinned: false,
      botId: a.botId || "",
    };
    store.update("conversations", (list) => [conv, ...list]);
  }
  const controller = new AbortController();
  try {
    const result = await runAgentTurn({
      settings,
      history: [{ role: "user", content: a.prompt }],
      approvalMode: "ask", // headless runs never auto-approve privileged tools
      botInstructions: "",
      memories: store.load("memories", []),
      agentTools: settings.agentTools,
      signal: controller.signal,
      events: {
        onStatus: () => {},
        onDelta: () => {},
        onToolCall: () => {},
        onToolResult: () => {},
        onApprovalRequest: () => Promise.resolve(false),
      },
    });
    store.update("conversations", (list) =>
      list.map((c) =>
        c.id === conv.id
          ? {
              ...c,
              unread: (c.unread || 0) + 1,
              updatedAt: Date.now(),
              messages: [
                ...c.messages,
                { role: "user", content: a.prompt, ts: Date.now(), automation: true },
                { role: "assistant", content: result.text || "", ts: Date.now(), automation: true },
              ],
            }
          : c
      )
    );
    store.onRebuild?.();
    if (Notification.isSupported()) {
      const n = new Notification({ title: `Automation: ${a.name}`, body: (result.text || "ran").slice(0, 120) });
      n.on("click", () => focusMain(`chat/${conv.id}`));
      n.show();
    }
  } catch (err) {
    console.error("automation failed", a.name, err);
  }
}

/* ---------------- IPC: MCP servers ---------------- */
ipcMain.handle("mcp:list", async () => {
  const mcp = require("./mcp");
  const configs = store.load("mcp", []);
  return { configs, connected: mcp.connectedServers() };
});

ipcMain.handle("mcp:add", async (_e, cfg) => {
  const mcp = require("./mcp");
  const config = { name: String(cfg?.name || "").trim(), command: String(cfg?.command || "").trim(), args: cfg?.args || [], enabled: true };
  if (!config.name || !config.command) return { ok: false, error: "name and command are required" };
  try {
    await mcp.startServer(config);
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
  store.update("mcp", (list) => [...(list || []).filter((c) => c.name !== config.name), config]);
  return { ok: true };
});

ipcMain.handle("mcp:remove", (_e, name) => {
  const mcp = require("./mcp");
  mcp.stopServer(name);
  store.update("mcp", (list) => (list || []).filter((c) => c.name !== name));
  return { ok: true };
});

ipcMain.handle("mcp:tools", () => {
  const mcp = require("./mcp");
  return mcp.agentToolDefs().map((d) => ({ name: d.function.name, description: d.function.description, server: d._mcp.server }));
});

function connectSavedMcpServers() {
  const mcp = require("./mcp");
  for (const cfg of store.load("mcp", [])) {
    if (cfg.enabled !== false) mcp.startServer(cfg).catch((e) => console.warn(`mcp ${cfg.name} failed:`, e.message));
  }
}

/* ---------------- IPC: cloud-agent publish (local hosting) ---------------- */
ipcMain.handle("publish:state", () => require("./publish").publishState());

ipcMain.handle("publish:publish", async (_e, botId) => {
  const bots = store.load("bots", []);
  const bot = bots.find((b) => b.id === botId);
  if (!bot) return { ok: false, error: "bot not found" };
  const publish = require("./publish");
  const res = await publish.publishBot({
    bot,
    runTurn: async (id, message, sessions) => {
      const settings = store.load("settings", defaultSettings());
      const sessionKey = "s";
      const history = sessions.get(sessionKey) || [];
      history.push({ role: "user", content: String(message).slice(0, 4000) });
      try {
        const turn = await runAgentTurn({
          settings,
          history,
          approvalMode: "ask",
          botInstructions: bot.instructions,
          botKnowledge: bot.knowledge,
          memories: store.load("memories", []),
          agentTools: ["web_search", "web_fetch", "generate_photo", "read_file"],
          signal: new AbortController().signal,
          toolContext: {},
          events: { onStatus: () => {}, onDelta: () => {}, onToolCall: () => {}, onToolResult: () => {}, onApprovalRequest: () => Promise.resolve(false) },
        });
        history.push({ role: "assistant", content: turn.text });
        sessions.set(sessionKey, history.slice(-12));
        trackUsage(settings, turn.usage);
        return turn.text;
      } catch (err) {
        return `Sorry — I couldn't reach my model provider: ${String(err.message).slice(0, 120)}`;
      }
    },
  });
  return { ok: true, ...res };
});

ipcMain.handle("publish:access", (_e, { botId, access }) => {
  const res = require("./publish").setAccess(botId, access);
  return res ? { ok: true, ...res } : { ok: false, error: "not published" };
});

ipcMain.handle("publish:unpublish", (_e, botId) => {
  require("./publish").unpublishBot(botId);
  return { ok: true };
});

/* ---------------- IPC: teach mode (learn from demonstration) ---------------- */
const teachSessions = new Map(); // id -> { timer, shots: [] }

ipcMain.handle("teach:start", async (_e, { intervalMs }) => {
  const { desktopCapturer } = require("electron");
  const id = crypto.randomUUID();
  const session = { timer: null, shots: [] };
  teachSessions.set(id, session);
  session.timer = setInterval(async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1400, height: 800 } });
      if (!sources[0]) return;
      const mediaId = `${crypto.randomUUID()}.png`;
      await fsp.writeFile(path.join(mediaDir(), mediaId), sources[0].thumbnail.toPNG());
      session.shots.push(`emberling-media://${mediaId}`);
    } catch {}
  }, Math.max(2000, intervalMs || 4000));
  return { ok: true, id };
});

ipcMain.handle("teach:stop", (_e, { id }) => {
  const session = teachSessions.get(id);
  if (!session) return { ok: true, shots: [] };
  clearInterval(session.timer);
  teachSessions.delete(id);
  return { ok: true, shots: session.shots.slice(0, 20) };
});

/* ---------------- IPC: open file in viewer window (pdf etc.) ---------------- */
ipcMain.handle("files:openViewer", (_e, filePath) => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    backgroundColor: "#141414",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(filePath).catch(() => {});
  return true;
});

// Brand app icon (build/icon-*.png, generated by scripts/make-icons.cjs)
function appIcon() {
  const p = path.join(__dirname, "..", "build", "icon.png");
  if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  return undefined;
}

const ORB_ICON_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACTUlEQVR42u2WP2gTYRjGz0FBHAyYwUFB5EBEAlkEiUKD4JIhSyl0cEgGl4MsHQqC9QyKg38IeItDbWgpFiloBodQMKHgYEFajXQp9RDa2mqo9+SSgELDK9/H95XL5ZJcVITCvfAsl3zf83vf77k/ihJUUEEF9Y8LwGkAl53au5tIkqbeIU2N/tGm4XCYvBSLxSiTyVA+n6disUimabYJQNU2V3dJU0nIAjD6VwCpVIoMw6BPS29pc2GO68vqxw5zCdB4vwAHAL8GoADguG+ASCTCTSuVCje0xi5RM6m0aePGBdJHrvKpSFi5njQ1R5pa/jk78QLALoBfAB76OU92hgXZUfVxusPYLePi0Q4A1563AbQAmP2CNC3GVWXmO/mJvuZS45FjvQByAmC5m/kogHVpziYwkrhG24lDvgHYf8+ePEEee0cB/BAAupf5PYfxukws68ivuXMKPcxNAKFe5tPOlL66cmRgALbGsbcujFsCIuoVNmluuCfzJn54YAC2BsCQ6FaaLwM44zV6GbiCVy4GnUD9/jDVFufJYdwS4Qt1C94WgD0AmtfvfjLQ0M6TPXOLamsrhI3PZH3flgCljpF7AJR6jYgl2n0XNNKneKf2/AOqfVjkpvvaNOnZ5CQ/Ar8vkCHXuBjIlAiPns1m6d2Tm2S/fkp26fl+l24xkHouTePxc12fA/0gTBcIl2VZxISdrXbDtRUOxUzZRPw8Cf2AREXnL8XRODWFb1/1+qPrZXbmrhyUm0kl/t/e+82kEmKGQqHgSyiooA5s/QaZJZN9ZTG0HwAAAABJRU5ErkJggg==";
