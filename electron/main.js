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
const { scopeId, AgentStore } = require("./agent-store");
const guard = require("./guard");

// self-protection firewall: the agent may not modify its own application
// code, security settings, or kill itself (the original's write-protection /
// workspace-boundary layer, local edition). One instance at module scope —
// visible turns, headless automations and published bots all share it.
const selfGuard = guard.createGuard({
  roots: [path.dirname(process.execPath), process.resourcesPath || "", app.getAppPath()],
  userDataDir: app.getPath("userData"),
});

/* ---------------- Bot-to-bot orchestration ---------------- */
// find (or create) the standing conversation for a Bot — where delegated
// exchanges with that Bot are recorded
async function ensureBotConversation(bot) {
  const conversations = store.load("conversations", []);
  const existing = conversations
    .filter((c) => c.botId === bot.id && !c.automationId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (existing.length && existing[0].messages?.length) return existing[0].id;
  const convId = crypto.randomUUID();
  store.update("conversations", (list) => [
    { id: convId, title: `${bot.emoji || "🤖"} ${bot.name}`, messages: [], createdAt: Date.now(), updatedAt: Date.now(), botId: bot.id, unread: 0 },
    ...list,
  ]);
  store.onRebuild?.();
  return convId;
}

// factory: a sendBotMessage tool implementation for a given sender Bot at a
// given orchestration depth. depth caps Bots-messaging-Bots recursion.
function makeBotMessenger({ bots, settings, controller, selfGuard, depth, currentBotId, currentBotName }) {
  return async function sendBotMessage(targetName, message) {
    const target = bots.find((b) => b.name.toLowerCase() === String(targetName || "").trim().toLowerCase());
    if (!target) return { ok: false, error: `no Bot named "${String(targetName || "").slice(0, 60)}" — use bots_list to see the available ones` };
    if (target.id === currentBotId) return { ok: false, error: "that is this Bot — the message would loop back to you" };
    if (depth >= 2) return { ok: false, error: "orchestration depth limit reached (Bots messaging Bots messaging Bots is not allowed)" };
    if (!String(message || "").trim()) return { ok: false, error: "empty message" };
    const targetConvId = await ensureBotConversation(target);
    const sub = await runAgentTurn({
      settings,
      history: [{ role: "user", content: (currentBotName + " handed you this subtask:\n\n" + String(message || "")).slice(0, 8000) }],
      approvalMode: "auto",
      botInstructions: target.instructions || "",
      botKnowledge: target.knowledge || [],
      memories: store.load("memories", []),
      agentTools: settings.agentTools,
      signal: controller.signal,
      toolContext: {
        botId: target.id,
        sandboxScope: scopeId(target.id),
        executionTarget: settings.executionTarget === "sandbox" ? "sandbox" : "local",
        selfGuard: (toolName, toolArgs) => selfGuard.check(toolName, toolArgs),
        orchestrationDepth: depth + 1,
        sendBotMessage: makeBotMessenger({ bots, settings, controller, selfGuard, depth: depth + 1, currentBotId: target.id, currentBotName: target.name }),
      },
      events: { onStatus: () => {}, onDelta: () => {}, onToolCall: () => {}, onToolResult: () => {}, onApprovalRequest: () => Promise.resolve(true) },
    });
    // record the exchange in the target Bot's own conversation
    const conversations = store.load("conversations", []);
    const tconv = conversations.find((c) => c.id === targetConvId);
    if (tconv) {
      store.update("conversations", (list) =>
        list.map((c) =>
          c.id === targetConvId
            ? {
                ...c,
                unread: (c.unread || 0) + 1,
                updatedAt: Date.now(),
                messages: [
                  ...c.messages,
                  { role: "user", content: ("[from " + currentBotName + "] " + String(message || "")).slice(0, 4000), ts: Date.now() },
                  { role: "assistant", content: sub.text || "", ts: Date.now() },
                ],
              }
            : c
        )
      );
      store.onRebuild?.();
    }
    return { ok: true, from: target.name, reply: (sub.text || "").slice(0, 8000) };
  };
}

// scheme privileges must be registered before app is ready
require("electron").protocol.registerSchemesAsPrivileged([
  { scheme: "emberling-media", privileges: { stream: true, bypassCSP: false } },
]);

// optional isolated profile (also gives the single-instance lock its own
// scope): emberling.exe --user-data-dir=C:\path
const uddArg = process.argv.find((a) => a.startsWith("--user-data-dir="));
if (uddArg) {
  app.setPath("userData", uddArg.slice("--user-data-dir=".length));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  bootstrap();
}

let mainWindow = null;
let orbWindow = null;
let tray = null;
let updateApi = null; // set by setupAutoUpdate when packaged
const activeTurns = new Map(); // conversationId -> AbortController
const pendingApprovals = new Map(); // approvalId -> {resolve, request}

/* ---------------- Auto-update (electron-updater ↔ GitHub releases) ----------------
 * Packaged NSIS installs: check GitHub for the latest release (latest.yml),
 * download in the background, and surface a "Restart to update" banner —
 * a pending update also applies silently on quit if the banner is dismissed.
 * Portable builds can't self-install; they get a "get it from GitHub" button. */
function setupAutoUpdate() {
  if (!app.isPackaged) return null;
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
  let updater;
  try {
    ({ autoUpdater: updater } = require("electron-updater"));
  } catch (err) {
    console.warn("auto-update unavailable:", err?.message);
    return null;
  }
  const push = (payload) => {
    if (!mainWindow?.isDestroyed()) mainWindow.webContents.send("updater:event", payload);
  };
  updater.autoDownload = !portable;
  updater.autoInstallOnAppQuit = true;
  updater.on("update-available", (info) => push({ state: portable ? "available" : "downloading", version: info.version, portable }));
  updater.on("download-progress", (p) => push({ state: "downloading", percent: Math.round(p.percent || 0), version: p.version }));
  updater.on("update-downloaded", (info) => push({ state: "ready", version: info.version }));
  updater.on("error", (err) => {
    console.warn("update check failed:", err?.message);
    push({ state: "error", message: String(err?.message || err).slice(0, 200) });
  });
  const check = () => updater.checkForUpdates();
  // shortly after launch, then every 6 hours; offline failures stay quiet
  setTimeout(() => check().catch(() => {}), 6000);
  setInterval(() => check().catch(() => {}), 6 * 60 * 60 * 1000);
  return { check, install: () => updater.quitAndInstall(true, true), portable };
}

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
  const settings = loadSettings();
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
    const settings = loadSettings();
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
  else {
    orbWindow.hide();
    previewWindow?.hide();
  }
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

// Hover preview bubble — a separate click-through window shown above the mark
// (the original's glass hover bubble) with the latest chat as context.
let previewWindow = null;

function latestConversationPreview() {
  try {
    const conversations = store.load("conversations", []);
    const c = conversations[0];
    if (!c) return null;
    const last = (c.messages || []).filter((m) => m && m.content).slice(-1)[0];
    return {
      title: c.title || "New chat",
      snippet: last ? String(last.content).replace(/\s+/g, " ").trim().slice(0, 140) : "No messages yet — say hi.",
    };
  } catch {
    return null;
  }
}

function createPreviewWindow() {
  previewWindow = new BrowserWindow({
    width: 320,
    height: 128,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  previewWindow.setIgnoreMouseEvents(true);
  previewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  previewWindow.setAlwaysOnTop(true, "screen-saver");
  if (isDev()) {
    previewWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/preview.html`);
  } else {
    previewWindow.loadFile(path.join(rendererDir(), "preview.html"));
  }
  previewWindow.on("closed", () => {
    previewWindow = null;
  });
}

function showOrbPreview() {
  if (!orbWindow) return;
  if (!previewWindow) createPreviewWindow();
  const b = orbWindow.getBounds();
  const wa = require("electron").screen.getPrimaryDisplay().workArea;
  const W = 320, H = 128;
  let x = Math.round(b.x + b.width / 2 - W / 2);
  x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - W - 8);
  let y = b.y - H - 10;
  if (y < wa.y + 8) y = b.y + b.height + 10; // no room above the mark → below
  previewWindow.setBounds({ x, y, width: W, height: H });
  previewWindow.webContents.send("orb:preview-data", latestConversationPreview());
  previewWindow.showInactive();
}

ipcMain.on("orb:hover", (_e, on) => {
  if (!on) {
    previewWindow?.hide();
    return;
  }
  showOrbPreview();
});

// --orb-preview-test: flash the hover bubble once so visual checks can see it
// without a real pointer hover.
if (process.argv.includes("--orb-preview-test")) {
  app.whenReady().then(() => {
    setTimeout(() => {
      showOrbPreview();
      setTimeout(() => previewWindow?.hide(), 20000);
    }, 2000);
  });
}

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
    updateApi = setupAutoUpdate();
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
const secureStore = require("./secure-store");
const COLLECTIONS = ["conversations", "bots", "memories", "automations", "settings", "integrations", "usage", "mcp"];

// Main-process settings loader. Secrets at rest are DPAPI-encrypted
// (enc:...); only the renderer's store:get path used to decrypt them, so
// agent turns, automations and transcription were shipping encrypted keys
// to providers (HTTP 401 "Missing Authentication header"). Every
// main-process read of settings goes through this.
function loadSettings() {
  return secureStore.decryptDeep({ ...defaultSettings(), ...store.load("settings", {}) });
}

for (const col of COLLECTIONS) {
  ipcMain.handle(`store:get:${col}`, () => {
    const value = store.load(col, col === "conversations" ? [] : col === "settings" ? defaultSettings() : {});
    // secrets at rest are DPAPI-encrypted (device-bound); decrypt transparently
    return col === "settings" || col === "integrations" ? secureStore.decryptDeep(value) : value;
  });
  ipcMain.handle(`store:set:${col}`, (_e, value) => {
    store.update(col, () => (col === "settings" || col === "integrations" ? secureStore.encryptDeep(value) : value));
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
      "ocr_image", "window_screenshot",
      "screen_screenshot", "spawn_subagent", "react_to_message", "request_user_form",
      "send_email", "list_windows", "focus_window", "type_text", "save_memory",
      "browser_open", "browser_snapshot", "browser_click", "browser_type", "browser_scroll",
      "browser_read", "browser_screenshot", "browser_close",
      "store_write", "store_read", "store_list", "store_search", "store_versions", "store_delete",
      "link_preview", "routine_list", "routine_add", "routine_remove",
    ],
    autoReviewRules: [],
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

/* ---------------- IPC: updater ---------------- */
ipcMain.handle("updater:check", async () => {
  const current = app.getVersion();
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
  if (!updateApi) {
    return { ok: true, current, state: !app.isPackaged ? "dev" : "unavailable", portable };
  }
  try {
    const result = await updateApi.check();
    const latest = String(result?.updateInfo?.version || "");
    return { ok: true, current, latest, updateAvailable: Boolean(latest) && latest !== current, portable };
  } catch (err) {
    return { ok: false, current, portable, error: String(err?.message || err).slice(0, 200) };
  }
});
ipcMain.on("updater:install", () => updateApi?.install());
ipcMain.handle("updater:openReleases", () => shell.openExternal("https://github.com/PiyushAnand2006/EmberLing/releases/latest"));

/* ---------------- IPC: Section-A integrations ---------------- */
const reposApi = require("./integrations/repos");
const slackApi = require("./integrations/slack");
const teamsApi = require("./integrations/teams");
const imessageApi = require("./integrations/imessage");
const opvault = require("./integrations/opvault");
const remoteExec = require("./remote");
const license = require("./license");
const { TOOL_DEFS: INTEG_TOOL_DEFS, executeIntegrationTool } = require("./integration-tools");

function getInteg(name, field) {
  const cfg = secureStore.decryptDeep(store.load("integrations", {}));
  return field ? cfg[name]?.[field] : cfg[name];
}
function getRemote() {
  const s = loadSettings();
  const r = s.remote || {};
  return {
    enabled: s.executionTarget === "remote" && !!r.host && !!r.user,
    name: r.name || "remote",
    host: r.host,
    port: r.port || 22,
    user: r.user,
    keyPath: remoteExec.keyPaths(r.name || "default").priv,
  };
}

/* Remote computer (SSH) — "On its computer" */
ipcMain.handle("remote:generateKey", async (_e, name) => {
  try {
    return await remoteExec.generateKeyPair(name);
  } catch (err) {
    return { error: String(err.message) };
  }
});
ipcMain.handle("remote:test", async (_e, cfg) => {
  try {
    return await remoteExec.testConnection({ ...cfg, keyPath: remoteExec.keyPaths(cfg.name || "default").priv });
  } catch (err) {
    return { ok: false, detail: String(err.message) };
  }
});
ipcMain.on("remote:setTarget", (_e, target) => {
  store.update("settings", (s) => ({ ...defaultSettings(), ...s, executionTarget: target === "remote" ? "remote" : "local" }));
});

/* ---------------- Linux sandbox (WSL) — the agent's local Linux box ---------------- */
const sandbox = require("./sandbox");
ipcMain.handle("sandbox:probe", () => sandbox.probe());
ipcMain.handle("sandbox:install", async () => {
  try {
    return await sandbox.install();
  } catch (err) {
    return { ok: false, note: String(err?.message || err).slice(0, 200) };
  }
});
ipcMain.handle("sandbox:reset", async () => {
  try {
    return await sandbox.reset();
  } catch (err) {
    return { ok: false, note: String(err?.message || err).slice(0, 200) };
  }
});
ipcMain.on("sandbox:setTarget", (_e, target) => {
  const next = target === "sandbox" ? "sandbox" : target === "remote" ? "remote" : "local";
  store.update("settings", (s) => ({ ...defaultSettings(), ...s, executionTarget: next }));
});

/* Repo connectors */
ipcMain.handle("repos:test", async (_e, { provider, token, org }) => {
  try {
    if (provider === "github") return { ok: true, repos: (await reposApi.ghRepos(token)).slice(0, 10) };
    if (provider === "gitlab") return { ok: true, repos: (await reposApi.glProjects(token)).slice(0, 10) };
    if (provider === "bitbucket") return { ok: true, repos: (await reposApi.bbRepos(token)).slice(0, 10) };
    if (provider === "azure") return { ok: true, repos: await reposApi.azProjects(token, org) };
    return { ok: false, error: "unknown provider" };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/* Slack */
ipcMain.handle("slack:test", async (_e, token) => {
  try {
    return await slackApi.test(token);
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/* Microsoft Teams — device-code OAuth with a client fallback chain */
const teamsFlowClients = new Map(); // deviceCode -> candidate index
ipcMain.handle("teams:startDeviceCode", async () => {
  try {
    return await teamsApi.startDeviceCode(0);
  } catch (err) {
    return { error: String(err.message) };
  }
});
ipcMain.handle("teams:pollToken", async (_e, deviceCode) => {
  try {
    // clientIndex travels with the device code so the fallback chain survives
    // across IPC calls (the UI re-invokes this handler while pending)
    const clientIndex = teamsFlowClients.get(deviceCode) ?? 0;
    const t = await teamsApi.pollToken(deviceCode, clientIndex, 12000);
    if (t.pending) return { ok: false, pending: true };
    store.update("integrations", (s) => ({
      ...s,
      teams: { ...(s.teams || {}), accessToken: t.accessToken, refreshToken: t.refreshToken, connected: true },
    }));
    return { ok: true };
  } catch (err) {
    // consent refused for this client: restart the flow with the next one and
    // hand the UI a fresh device code (Microsoft requires a new code per client)
    if (err instanceof teamsApi.ConsentError) {
      const started = await teamsApi.startDeviceCode(1).catch(() => null);
      if (started) {
        teamsFlowClients.set(started.deviceCode, started.clientIndex);
        return { ok: false, pending: true, restart: started, note: "Microsoft needs a second confirmation — a new code is ready" };
      }
    }
    return { ok: false, error: String(err.message) };
  }
});
ipcMain.handle("teams:me", async () => {
  try {
    const creds = { accessToken: getInteg("teams", "accessToken") || "", refreshToken: getInteg("teams", "refreshToken") || "" };
    if (!creds.accessToken) return { error: "not signed in" };
    const r = await teamsApi.withToken(creds, (token) => teamsApi.me(token));
    if (r.refreshed) {
      store.update("integrations", (s) => ({
        ...s,
        teams: { ...(s.teams || {}), accessToken: r.refreshed.accessToken, refreshToken: r.refreshed.refreshToken },
      }));
    }
    return r.result;
  } catch (err) {
    return { error: String(err.message) };
  }
});

/* 1Password */
ipcMain.handle("op:status", async () => opvault.available());

/* iMessage platform note */
ipcMain.handle("imessage:platform", () => ({ isMac: imessageApi.IS_MAC, platform: process.platform }));

/* License (Emberling Plus) */
ipcMain.handle("license:activate", (_e, key) => {
  const res = license.validate(key);
  if (res.ok) {
    store.update("settings", (s) => ({ ...defaultSettings(), ...s, plus: true, plusKeyHolder: res.name }));
  }
  return res;
});
ipcMain.handle("license:status", () => {
  const s = loadSettings();
  return { plus: !!s.plus, holder: s.plusKeyHolder || "" };
});

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
  const settings = loadSettings();
  const { transcribe } = require("./providers");
  try {
    const text = await transcribe({ settings, filePath: path.join(mediaDir(), mediaId), mimeType });
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/* ---------------- IPC: agent turns ---------------- */
// Additive migration: newly introduced tools become available to existing
// installs whose saved settings predate them (user opt-outs still persist —
// only ids missing entirely are added).
const NEW_DEFAULT_TOOLS = [
  "browser_open", "browser_snapshot", "browser_click", "browser_type", "browser_scroll",
  "browser_read", "browser_screenshot", "browser_close",
  "store_write", "store_read", "store_list", "store_search", "store_versions", "store_delete",
  "link_preview", "routine_list", "routine_add", "routine_remove",
  "ocr_image", "window_screenshot",
];

function migrateSettings(saved) {
  const s = { ...defaultSettings(), ...saved };
  s.agentTools = Array.from(new Set([...(Array.isArray(s.agentTools) ? s.agentTools : []), ...NEW_DEFAULT_TOOLS]));
  return s;
}

ipcMain.handle("agent:send", async (event, { conversationId, history, botId, roomBots, mode }) => {
  // An edit-and-resend (or retry) while the previous turn is still streaming
  // must close the old provider connection first — keyless tiers answer one
  // request per IP, so overlapping turns 429 with "previous request is still
  // running". Abort the prior turn and let it unwind before starting.
  const prior = activeTurns.get(conversationId);
  if (prior?.controller) {
    prior.controller.abort();
    await prior.done.catch(() => {});
  }
  let doneResolve = () => {};
  const done = new Promise((r) => (doneResolve = r));
  const settings = migrateSettings(loadSettings());
  const bots = store.load("bots", []);
  const memories = store.load("memories", []);
  const bot = bots.find((b) => b.id === botId) || null;
  const controller = new AbortController();
  activeTurns.set(conversationId, { controller, done });
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

  // Window-scoped capture — the original's sand-window-capture: grab one
  // window by (partial) title even when it's only partially visible. The
  // desktopCapturer (WGC) path is fast but flakes out on some windows, so
  // fall back to Win32 PrintWindow via PowerShell.
  const takeWindowScreenshot = async (title) => {
    const needle = String(title || "").trim().toLowerCase();
    if (!needle) return { ok: false, error: "window_screenshot needs a 'title' to match — use list_windows first" };
    let wgcError = null;
    let wgcNames = "";
    let captured = null;
    try {
      const { desktopCapturer } = require("electron");
      const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 1600, height: 900 } });
      wgcNames = sources.map((s) => s.name).filter(Boolean).slice(0, 8).join(", ");
      const match = sources.find((s) => (s.name || "").toLowerCase().includes(needle));
      if (match && !match.thumbnail.isEmpty()) {
        const id = `${crypto.randomUUID()}.png`;
        await fsp.writeFile(path.join(mediaDir(), id), match.thumbnail.toPNG());
        captured = { ok: true, url: `emberling-media://${id}`, window: match.name };
      }
    } catch (err) {
      wgcError = err;
    }
    if (captured) return captured;
    // WGC missed (flakes out on some windows/machines and can even enumerate
    // without them) — always give Win32 PrintWindow a chance before failing
    const outPath = path.join(mediaDir(), `${crypto.randomUUID()}.png`);
    try {
      const stdout = await new Promise((resolve, reject) => {
        const { execFile } = require("node:child_process");
        execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "window-capture.ps1"), String(title), outPath], { timeout: 30_000, windowsHide: true }, (err2, stdout2, stderr2) => {
          if (err2 && !stdout2) return reject(new Error((stderr2 || err2.message).slice(0, 200)));
          resolve(String(stdout2 || ""));
        });
      });
      if (stdout.includes("__NOWINDOW__")) {
        return { ok: false, error: `no window matching "${title}"${wgcNames ? ` — WGC saw: ${wgcNames}` : ""}` };
      }
      const st = await fsp.stat(outPath).catch(() => null);
      if (!st || !st.size) throw new Error(wgcError ? `capture failed: ${String(wgcError.message).slice(0, 120)}` : "capture produced no image");
      return { ok: true, url: `emberling-media://${path.basename(outPath)}`, note: "captured via PrintWindow fallback" };
    } catch (err) {
      return { ok: false, error: `window capture failed: ${String(err?.message || err).slice(0, 160)}` };
    }
  };

  // browser screenshots land in the same media store as app screenshots
  const saveBrowserShot = async (pngBuffer) => {
    const id = `${crypto.randomUUID()}.png`;
    await fsp.writeFile(path.join(mediaDir(), id), pngBuffer);
    return { ok: true, url: `emberling-media://${id}` };
  };

  // shared turn helpers (member-independent)
  const resolveAutoReview = (toolName, args) => {
    const rules = loadSettings().autoReviewRules;
    if (!Array.isArray(rules) || !rules.length) return null;
    const haystack = (toolName + " " + JSON.stringify(args ?? {})).toLowerCase();
    for (const rule of rules) {
      const pattern = String(rule?.pattern || "").trim().toLowerCase();
      if (!pattern) continue;
      const hit = pattern.startsWith("/") ? safeRegexHit(pattern, haystack) : haystack.includes(pattern);
      if (hit) return rule.action === "allow" || rule.action === "deny" || rule.action === "ask" ? rule.action : null;
    }
    return null;
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

  // tool-context module deps — hoisted above buildToolContext (its closures
  // reference these; declaring them inside the try left the closures with a
  // ReferenceError: integTools is not defined)
  const mcp = require("./mcp");
  const integTools = require("./integration-tools");
  const plugins = require("./plugins");

  // per-member tool context: rooms give every member Bot its own store scope,
  // VM and screen state, while shared surfaces (approvals, screenshots) are common
  const buildToolContext = (memberBotId, memberBot) => {
    const mScope = memberBotId ? scopeId(memberBotId) : "default";
    const mStore = new AgentStore(path.join(app.getPath("userData"), "agent-store"), memberBotId);
    return {
      takeScreenshot,
      takeScreenScreenshot,
      takeWindowScreenshot,
      saveMemory,
      spawnSubagent,
      requestForm,
      uiAction: (action) => send("uiAction", action),
      callMcp: (toolName) => mcp.resolveMcpCall(toolName),
      getInteg,
      getRemote,
      store,
      botId: memberBotId || "",
      executionTarget: settings.executionTarget === "sandbox" ? "sandbox" : "local",
      // per-Dotling VMs: each bot gets its own WSL distro, cloned lazily
      sandboxScope: mScope,
      agentStore: mStore,
      saveBrowserShot,
      resolveAutoReview,
      selfGuard: (toolName, toolArgs) => selfGuard.check(toolName, toolArgs),
      screenState: (entry) => require("./screen-state").recordScreenState(path.join(app.getPath("userData"), "agent-store"), memberBotId, entry),
      allAutomations: store.load("automations", []),
      allBots: bots,
      saveAutomation: (a) => {
        store.update("automations", (list) => [...list.filter((x) => x.id !== a.id), a]);
      },
      removeAutomation: (id) => {
        store.update("automations", (list) => list.filter((x) => x.id !== id));
      },
      // bot-to-bot orchestration: run a capped sub-turn as the target Bot
      // (its instructions, its own VM scope and store) and return its reply.
      // The exchange is recorded in the target Bot's own conversation so the
      // user can see what was asked and answered. Nested turns get their own
      // messenger at depth+1, capped so Bots-messaging-Bots can't recurse.
      sendBotMessage: makeBotMessenger({
        bots, settings, controller, selfGuard, depth: 0,
        currentBotId: memberBotId || "", currentBotName: memberBot?.name || "Emberling",
      }),
      tryIntegrationTool: async (call) => {
        // dispatch order: Section-A integrations → plugins → null (local)
        const viaInteg = await integTools.executeIntegrationTool(call, { getInteg, getRemote, store });
        if (viaInteg !== null && viaInteg !== undefined) return viaInteg;
        return plugins.executePluginTool(call, store);
      },
    };
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
    const mcpCfgs = store.load("mcp", []);
    const mcpDefs = mcp.agentToolDefs().filter((d) => {
      const c = mcpCfgs.find((x) => x.name === d._mcp.server);
      return !(c?.disabledTools || []).includes(d._mcp.tool);
    });
    const mcpInstructions = mcpCfgs
      .filter((c) => (c.instructions || "").trim() && mcp.getServer(c.name))
      .map((c) => `[MCP server "${c.name}"] ${c.instructions.trim()}`)
      .join("\n");
    const integTools = require("./integration-tools");
    const plugins = require("./plugins");
    const pluginDefs = plugins.agentToolDefs(store);

    // Room orchestration (the original's group chats): when multiple Bots are
    // members, EVERY member processes the message in turn — each with its own
    // instructions, VM scope and store — and each reply lands as its own
    // labeled bubble. Single bot / default chats keep the existing path.
    const roomList = Array.isArray(roomBots)
      ? [...new Set(roomBots.filter((id) => id && bots.some((b) => b.id === id)))]
      : [];
    if ((botId || "") && !roomList.includes(botId)) roomList.unshift(botId);
    const isRoom = roomList.length > 1;

    let result = null;
    if (isRoom) {
      const texts = [];
      for (let mi = 0; mi < roomList.length; mi++) {
        if (controller.signal.aborted) break;
        const mBot = bots.find((b) => b.id === roomList[mi]) || { name: "Emberling", instructions: "", knowledge: [], skills: [] };
        send("member-start", { botId: mBot.id, name: mBot.name, emoji: mBot.emoji });
        const r = await runAgentTurn({
          settings,
          history,
          approvalMode: settings.approvalMode || "ask",
          botInstructions: mBot.instructions || "",
          botKnowledge: mBot.knowledge || [],
          botSkills: mBot.skills || [],
          mcpInstructions,
          memories,
          agentTools: settings.agentTools,
          signal: controller.signal,
          extraToolDefs: [...mcpDefs, ...integTools.TOOL_DEFS, ...pluginDefs],
          toolContext: buildToolContext(mBot.id, mBot),
          events: {
            onStatus: (text) => send("status", { text }),
            onDelta: (delta) => send("delta", { delta }),
            onToolCall: (call) => send("toolCall", { call }),
            onToolResult: (call, res) => send("toolResult", { call, result: res }),
            onApprovalRequest: askApproval,
          },
        });
        trackUsage(settings, r?.usage);
        texts.push(((mBot.emoji ? mBot.emoji + " " : "") + "**" + mBot.name + "**\n\n" + (r.text || "")).trim());
        if (r.stopped) break;
      }
      result = { text: texts.join("\n\n---\n\n") };
    } else {
      const singleBotId = roomList[0] || "";
      const mBot = singleBotId ? bots.find((b) => b.id === singleBotId) : bot;
      result = await runAgentTurn({
        settings,
        history,
        approvalMode: settings.approvalMode || "ask",
        botInstructions: mBot?.instructions || "",
        botKnowledge: mBot?.knowledge || [],
        botSkills: mBot?.skills || [],
        mcpInstructions,
        memories,
        agentTools: settings.agentTools,
        signal: controller.signal,
        extraToolDefs: [...mcpDefs, ...integTools.TOOL_DEFS, ...pluginDefs],
        toolContext: buildToolContext(singleBotId, mBot),
        events: {
          onStatus: (text) => send("status", { text }),
          onDelta: (delta) => send("delta", { delta }),
          onToolCall: (call) => send("toolCall", { call }),
          onToolResult: (call, res) => send("toolResult", { call, result: res }),
          onApprovalRequest: askApproval,
        },
      });
    }
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
    doneResolve();
  }
});

function truncateMain(s, n) {
  return String(s || "").length > n ? String(s || "").slice(0, n) + "…" : String(s || "");
}

// auto-review /pattern/ syntax: invalid regexes simply never match
function safeRegexHit(pattern, haystack) {
  try {
    return new RegExp(pattern.slice(1, -1), "i").test(haystack);
  } catch {
    return false;
  }
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
  activeTurns.get(conversationId)?.controller?.abort();
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
  startAutomationWebhookServer();
}

/* ---------------- Automation webhooks ----------------
 * POST http://127.0.0.1:<port>/webhook/<automationId>?key=<token> triggers an
 * automation run — the original's CreateAutomationWebhookApiKey, local only.
 * The server binds exclusively to loopback; each automation gets a random
 * token shown once when webhooks are enabled for it. */
let webhookServer = null;
let webhookPort = null;

function automationWebhookToken(a) {
  const automations = store.load("automations", []);
  const cur = automations.find((x) => x.id === a.id);
  if (cur?.webhookKey) return cur.webhookKey;
  const key = crypto.randomBytes(16).toString("hex");
  store.update("automations", (list) => list.map((x) => (x.id === a.id ? { ...x, webhookKey: key } : x)));
  return key;
}

// loopback-only listener; incoming POSTs trigger the matching automation
function startAutomationWebhookServer() {
  if (webhookServer) return;
  const http = require("node:http");
  webhookServer = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    const u = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method !== "POST" || !u.pathname.startsWith("/webhook/")) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: "not found" }));
      return;
    }
    const id = u.pathname.slice("/webhook/".length);
    const key = u.searchParams.get("key") || "";
    const automations = store.load("automations", []);
    const a = automations.find((x) => x.id === id);
    if (!a || !a.enabled || !a.webhook) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: "no such webhook automation" }));
      return;
    }
    if (!a.webhookKey || key !== a.webhookKey) {
      res.statusCode = 401;
      res.end(JSON.stringify({ ok: false, error: "invalid webhook key" }));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      // bounded body: webhook payloads feed the prompt, never file uploads
      const payload = body.slice(0, 4000);
      res.end(JSON.stringify({ ok: true, triggered: a.name }));
      const prompt = payload.trim() ? `${a.prompt}\n\nWebhook payload: ${payload.trim()}` : a.prompt;
      try {
        await runAutomationTurn({ ...a, prompt });
      } catch (err) {
        console.error("webhook automation failed:", err?.message);
      }
    });
  });
  webhookServer.on("error", (err) => {
    console.warn("webhook server unavailable:", err?.message);
    webhookServer = null;
  });
  webhookServer.listen(0, "127.0.0.1", () => {
    webhookPort = webhookServer.address()?.port;
  });
}

function webhookInfo() {
  return webhookServer && webhookPort ? { port: webhookPort, url: `http://127.0.0.1:${webhookPort}/webhook/` } : null;
}

ipcMain.handle("automations:webhookEnable", (_e, { id, enable }) => {
  const automations = store.load("automations", []);
  const a = automations.find((x) => x.id === id);
  if (!a) return { ok: false, error: "automation not found" };
  let key = a.webhookKey;
  if (enable && !key) {
    key = crypto.randomBytes(16).toString("hex");
    store.update("automations", (list) => list.map((x) => (x.id === id ? { ...x, webhook: true, webhookKey: key } : x)));
  } else {
    store.update("automations", (list) => list.map((x) => (x.id === id ? { ...x, webhook: !!enable } : x)));
  }
  const info = webhookInfo();
  if (enable && !info) return { ok: true, enabled: true, url: null, note: "webhook listener starting — check again in a moment" };
  return { ok: true, enabled: !!enable, url: enable && info ? `${info.url}${id}?key=${key}` : null };
});
ipcMain.handle("automations:webhookPort", () => webhookPort);
ipcMain.handle("automations:runNow", async (_e, id) => {
  const automations = store.load("automations", []);
  const a = automations.find((x) => x.id === id);
  if (!a) return { ok: false, error: "automation not found" };
  if (a.trigger?.type) {
    // event triggers: one poll now, force-firing on the newest event
    const res = await checkEventTrigger(a, true);
    return res.fired ? { ok: true } : { ok: false, error: res.note || "no new events" };
  }
  if (activeTurns.has("automation:" + id)) return { ok: false, error: "already running" };
  activeTurns.set("automation:" + id, new AbortController());
  try {
    await runAutomationTurn(a);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 200) };
  } finally {
    activeTurns.delete("automation:" + id);
  }
});

ipcMain.handle("automations:slackChannels", async () => {
  const token = getInteg("slack", "botToken");
  if (!token) return { ok: false, error: "Connect Slack in Integrations first" };
  try {
    const slack = require("./integrations/slack");
    const channels = await slack.listChannels(token);
    return { ok: true, channels: (channels || []).map((c) => ({ id: c.id, name: c.name })) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 160) };
  }
});

/* ---------------- Per-Dotling virtual screen ---------------- */
ipcMain.handle("bots:screen", async (_e, botId) => {
  const { readScreen, isActing } = require("./screen-state");
  const screen = await readScreen(path.join(app.getPath("userData"), "agent-store"), botId);
  const automations = store.load("automations", []).filter((a) => (a.botId || "") === (botId || ""));
  return {
    screen,
    acting: isActing(screen),
    routines: automations.map((a) => ({
      id: a.id,
      name: a.name,
      enabled: a.enabled,
      schedule: a.scheduleText || (a.schedule?.type === "minutes" ? `Every ${a.schedule.minutes || 60} min` : a.schedule?.type === "weekdays" ? `Weekdays at ${a.schedule.time}` : `Every day at ${a.schedule?.time || "09:00"}`),
      nextJoin: a.enabled && a.schedule?.type !== "minutes" && a.schedule?.time ? nextJoinText(a.schedule) : null,
    })),
  };
});

function nextJoinText(schedule) {
  const [h, m] = (schedule.time || "09:00").split(":").map(Number);
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

async function runDueAutomations() {
  const automations = store.load("automations", []);
  const now = Date.now();
  for (const a of automations) {
    if (!a.enabled) continue;
    if (a.trigger?.type) {
      await checkEventTrigger(a);
      continue;
    }
    const due = automationDue(a, now);
    if (!due) continue;
    store.update("automations", (list) => list.map((x) => (x.id === a.id ? { ...x, lastRun: now } : x)));
    await runAutomationTurn(a);
  }
}

/* ---------------- Event triggers (the original's Slack/repo triggers) ----------------
 * Polled on the same 30s tick as schedules. First poll only baselines the cursor
 * (so connecting never replays history); "check now" force-fires on the newest
 * event so the wiring can be verified without waiting for a real event. */

async function slackGet(token, method, params) {
  const qs = new URLSearchParams(params || {});
  const res = await fetch(`https://slack.com/api/${method}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function checkEventTrigger(a, force = false) {
  if (activeTurns.has("automation:" + a.id)) return { fired: false, note: "already running" };
  const t = a.trigger || {};
  try {
    if (t.type === "slack_mention") {
      const token = getInteg("slack", "botToken");
      if (!token) return { fired: false, note: "connect Slack in Integrations first" };
      if (!t.channel) return { fired: false, note: "pick a channel in the automation editor" };
      const state = { ...(a.triggerState || {}) };
      if (!state.botUserId) {
        const me = await slackGet(token, "auth.test", {});
        if (!me?.ok || !me.user_id) return { fired: false, note: me?.error || "Slack auth failed" };
        state.botUserId = me.user_id;
      }
      const params = { channel: t.channel, limit: 20 };
      if (state.lastTs) params.oldest = state.lastTs;
      const hist = await slackGet(token, "conversations.history", params);
      if (!hist?.ok) return { fired: false, note: hist?.error || "Slack history failed" };
      const fresh = (hist.messages || [])
        .filter((m) => m.type === "message" && !m.subtype && m.user !== state.botUserId)
        .sort((x, y) => Number(y.ts) - Number(x.ts));
      if (state.lastTs) state.lastTs = String(Math.max(Number(state.lastTs), ...fresh.map((m) => Number(m.ts)), 0)) || state.lastTs;
      else state.lastTs = fresh[0]?.ts || String(Date.now() / 1000);
      saveTriggerState(a, state);
      const mentions = fresh.filter((m) => String(m.text || "").includes(`<@${state.botUserId}>`));
      const hit = force ? mentions[0] || fresh[0] : mentions[0];
      if (!hit) return { fired: false, note: force ? "no messages in that channel yet" : "no new mentions" };
      return await fireTriggeredAutomation(a, `Slack trigger — you were mentioned in <#${t.channel}>:\n> ${String(hit.text || "").slice(0, 500)}`);
    }
    if (t.type === "repo_event") {
      const repo = (t.repo || "").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").trim();
      if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) return { fired: false, note: "set the repo as owner/name" };
      const kind = t.event === "pulls" ? "pulls" : "issues";
      const token = getInteg("github", "apiToken");
      const headers = { "User-Agent": "Emberling", Accept: "application/vnd.github+json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`https://api.github.com/repos/${repo}/${kind}?sort=created&direction=desc&per_page=5`, { headers });
      if (!res.ok) return { fired: false, note: `GitHub API ${res.status}` };
      const items = (await res.json()).filter((i) => (kind === "pulls" ? !!i.pull_request : !i.pull_request));
      const state = { ...(a.triggerState || {}) };
      const newest = items[0]?.created_at;
      if (!newest) return { fired: false, note: force ? `no ${kind} on ${repo} yet` : "nothing to baseline" };
      const had = !!state.lastCreatedAt;
      state.lastCreatedAt = newest;
      saveTriggerState(a, state);
      const freshItems = items.filter((i) => i.created_at > (had ? a.triggerState?.lastCreatedAt || "" : ""));
      const hit = force ? items[0] : freshItems[0];
      if (!hit) return { fired: false, note: force ? `baselined — newest ${kind.slice(0, -1)}: "${items[0].title}"` : "no new events" };
      return await fireTriggeredAutomation(a, `GitHub trigger — new ${kind === "pulls" ? "pull request" : "issue"} on ${repo}:\n> "${hit.title}" by ${hit.user?.login} — ${hit.html_url}`);
    }
    return { fired: false, note: "unknown trigger type" };
  } catch (err) {
    return { fired: false, note: String(err?.message || err).slice(0, 160) };
  }
}

function saveTriggerState(a, state) {
  store.update("automations", (list) => list.map((x) => (x.id === a.id ? { ...x, triggerState: state } : x)));
}

async function fireTriggeredAutomation(a, eventSummary) {
  activeTurns.set("automation:" + a.id, new AbortController());
  try {
    store.update("automations", (list) => list.map((x) => (x.id === a.id ? { ...x, lastRun: Date.now() } : x)));
    await runAutomationTurn({ ...a, prompt: `${a.prompt}\n\n${eventSummary}` });
    return { fired: true };
  } finally {
    activeTurns.delete("automation:" + a.id);
  }
}

function automationDue(a, now) {
  if (a.lastRun == null) return a.runImmediately !== false ? true : false;
  if (a.schedule?.type === "minutes") {
    return now - a.lastRun >= (a.schedule.minutes || 60) * 60_000;
  }
  if (a.schedule?.type === "daily" || a.schedule?.type === "weekdays") {
    const d = new Date(now);
    if (a.schedule.type === "weekdays" && (d.getDay() === 0 || d.getDay() === 6)) return false;
    const [h, m] = (a.schedule.time || "09:00").split(":").map(Number);
    const last = new Date(a.lastRun);
    const todayRun = new Date();
    todayRun.setHours(h, m, 0, 0);
    return now >= todayRun.getTime() && last.getTime() < todayRun.getTime();
  }
  return false;
}

async function runAutomationTurn(a) {
  const settings = loadSettings();
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
    // When the Linux sandbox is enabled, automations execute inside their
    // Dotling's own VM with no user interference — headless and approval-free
    // (the VM boundary is the control). Local privileged actions keep the
    // never-auto-approve rule for headless runs.
    const sandboxTarget = settings.executionTarget === "sandbox";
    const result = await runAgentTurn({
      settings,
      history: [{ role: "user", content: a.prompt }],
      approvalMode: "ask", // headless runs never auto-approve host-side tools
      botInstructions: "",
      memories: store.load("memories", []),
      agentTools: settings.agentTools,
      signal: controller.signal,
      toolContext: {
        store,
        executionTarget: sandboxTarget ? "sandbox" : "local",
        sandboxScope: sandboxTarget ? scopeId(a.botId) : undefined,
        resolveAutoReview: null,
        selfGuard: (toolName, toolArgs) => selfGuard.check(toolName, toolArgs),
      },
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
    automationNotify(a, `Automation: ${a.name}`, (result.text || "ran").slice(0, 120), conv.id);
  } catch (err) {
    console.error("automation failed", a.name, err);
    // failures are surfaced, not swallowed: the conversation gets an error
    // entry (+unread) and the user gets a failure toast (when enabled)
    const detail = String(err?.message || err).slice(0, 300);
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
                { role: "assistant", content: `⚠️ Automation failed: ${detail}`, ts: Date.now(), automation: true, error: detail },
              ],
            }
          : c
      )
    );
    store.onRebuild?.();
    automationNotify(a, `Automation failed: ${a.name}`, detail, conv.id);
  }
}

// Automation completion/failure toast — respects the global notifications
// toggle and the per-automation notify switch (default on). Clicking opens
// the automation's conversation.
function automationNotify(a, title, body, convId) {
  const settings = loadSettings();
  if (settings.notifications === false || a.notify === false) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  n.on("click", () => focusMain(`chat/${convId}`));
  n.show();
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

/* Block B13: MCP marketplace + per-server instructions / disabled tools / restart */
const MCP_MARKETPLACE = [
  { name: "filesystem", label: "Filesystem", desc: "Read/write local files in an allowed directory.", command: "npx -y @modelcontextprotocol/server-filesystem", argsTemplate: ["{{dir}}"], placeholder: "Directory to expose (e.g. C:\\Users\\you\\projects)" },
  { name: "fetch", label: "Fetch", desc: "Fetch web pages and convert to markdown.", command: "npx -y @modelcontextprotocol/server-fetch", argsTemplate: [], placeholder: "" },
  { name: "memory", label: "Memory", desc: "Persistent knowledge-graph memory.", command: "npx -y @modelcontextprotocol/server-memory", argsTemplate: [], placeholder: "" },
  { name: "time", label: "Time", desc: "Time and timezone conversions.", command: "npx -y @modelcontextprotocol/server-time", argsTemplate: [], placeholder: "" },
  { name: "everything", label: "Everything (demo)", desc: "Test server exercising all MCP features.", command: "npx -y @modelcontextprotocol/server-everything", argsTemplate: [], placeholder: "" },
];
ipcMain.handle("mcp:marketplace", () => MCP_MARKETPLACE);
ipcMain.handle("mcp:addFromMarketplace", async (_e, { name, placeholderValue }) => {
  const entry = MCP_MARKETPLACE.find((m) => m.name === name);
  if (!entry) return { ok: false, error: "unknown marketplace entry" };
  const args = entry.argsTemplate.map((a) => String(a).replace("{{dir}}", String(placeholderValue || process.env.USERPROFILE || process.env.HOME || ".")));
  const mcp = require("./mcp");
  const config = { name: entry.name, command: entry.command.split(" ")[0], args: [...entry.command.split(" ").slice(1), ...args], enabled: true };
  try {
    await mcp.startServer(config);
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
  store.update("mcp", (list) => [...(list || []).filter((c) => c.name !== config.name), config]);
  return { ok: true, tools: (mcp.getServer(entry.name)?.tools || []).map((t) => t.name) };
});
ipcMain.handle("mcp:setInstructions", (_e, { name, instructions }) => {
  store.update("mcp", (list) => (list || []).map((c) => (c.name === name ? { ...c, instructions: String(instructions || "").slice(0, 4000) } : c)));
  return { ok: true };
});
ipcMain.handle("mcp:setToolEnabled", (_e, { server, tool, enabled }) => {
  store.update("mcp", (list) =>
    (list || []).map((c) => {
      if (c.name !== server) return c;
      const disabled = new Set(c.disabledTools || []);
      enabled ? disabled.delete(tool) : disabled.add(tool);
      return { ...c, disabledTools: [...disabled] };
    })
  );
  return { ok: true };
});
ipcMain.handle("mcp:restart", async (_e, name) => {
  const mcp = require("./mcp");
  const cfg = (store.load("mcp", []) || []).find((c) => c.name === name);
  if (!cfg) return { ok: false, error: "not configured" };
  mcp.stopServer(name);
  try {
    await mcp.startServer(cfg);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/* Block B11: plugins */
ipcMain.handle("plugins:list", () => require("./plugins").registry(store));
ipcMain.handle("plugins:toggle", (_e, { id, enabled }) => {
  require("./plugins").setStatus(store, id, !!enabled);
  return { ok: true };
});
ipcMain.handle("plugins:uninstall", (_e, id) => {
  require("./plugins").uninstall(store, id);
  return { ok: true };
});
ipcMain.handle("plugins:installFile", async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"], filters: [{ name: "Plugin manifest", extensions: ["json"] }] });
  if (res.canceled || !res.filePaths[0]) return { ok: false, error: "cancelled" };
  try {
    const out = await require("./plugins").installFromFile(store, res.filePaths[0]);
    return out;
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/* Block B12: skills */
ipcMain.handle("skills:list", () => require("./skills").list(store));
ipcMain.handle("skills:upsert", (_e, skill) => require("./skills").upsert(store, skill));
ipcMain.handle("skills:remove", (_e, id) => require("./skills").remove(store, id));

/* Block B16: calendar */
ipcMain.handle("calendar:list", () => require("./calendar").list(store));
ipcMain.handle("calendar:upsert", (_e, ev) => require("./calendar").upsert(store, ev));
ipcMain.handle("calendar:remove", (_e, id) => require("./calendar").remove(store, id));
ipcMain.handle("calendar:exportIcs", async () => {
  const ics = require("./calendar").toIcs(require("./calendar").list(store));
  const saved = await dialog.showSaveDialog(mainWindow, { defaultPath: "emberling-calendar.ics" });
  if (saved.canceled || !saved.filePath) return { ok: false, error: "cancelled" };
  await fsp.writeFile(saved.filePath, ics, "utf8");
  return { ok: true, path: saved.filePath };
});
ipcMain.handle("calendar:importIcs", async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"], filters: [{ name: "iCalendar", extensions: ["ics"] }] });
  if (res.canceled || !res.filePaths[0]) return { ok: false, error: "cancelled" };
  const text = await fsp.readFile(res.filePaths[0], "utf8");
  return require("./calendar").importIcs(store, text);
});

/* Block B14: contacts */
ipcMain.handle("contacts:list", () => require("./contacts").list(store));
ipcMain.handle("contacts:upsert", (_e, contact) => require("./contacts").upsert(store, contact));
ipcMain.handle("contacts:remove", (_e, id) => require("./contacts").remove(store, id));

/* Block C: canvas pop-out — detach an ```html preview into its own window */
ipcMain.on("canvas:open", (_e, html) => {
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    backgroundColor: "#141414",
    autoHideMenuBar: true,
    title: "Emberling Canvas",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const data = `data:text/html;charset=utf-8,${encodeURIComponent(String(html || "").slice(0, 2_000_000))}`;
  win.loadURL(data).catch(() => {});
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
      const settings = loadSettings();
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
