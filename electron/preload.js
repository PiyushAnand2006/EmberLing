// Preload — the renderer bridge (original: electron-preload contextBridge).
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },

  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
  },

  store: {
    get: (collection) => ipcRenderer.invoke(`store:get:${collection}`),
    set: (collection, value) => ipcRenderer.invoke(`store:set:${collection}`, value),
  },

  providers: {
    list: () => ipcRenderer.invoke("providers:list"),
    test: (payload) => ipcRenderer.invoke("providers:test", payload),
    fetchModels: (payload) => ipcRenderer.invoke("providers:fetchModels", payload),
  },

  agent: {
    send: (payload) => ipcRenderer.invoke("agent:send", payload),
    stop: (conversationId) => ipcRenderer.send("agent:stop", conversationId),
    resolveApproval: (id, approved) => ipcRenderer.send("approval:resolve", { id, approved }),
    onEvent: (handler) => {
      const listener = (_e, evt) => handler(evt);
      ipcRenderer.on("agent:event", listener);
      return () => ipcRenderer.removeListener("agent:event", listener);
    },
  },

  media: {
    save: (payload) => ipcRenderer.invoke("media:save", payload),
    readText: (filePath) => ipcRenderer.invoke("media:readText", filePath),
  },

  dialog: {
    pickFiles: () => ipcRenderer.invoke("dialog:pickFiles"),
    saveExport: (payload) => ipcRenderer.invoke("dialog:saveExport", payload),
  },

  voice: {
    transcribe: (payload) => ipcRenderer.invoke("voice:transcribe", payload),
  },

  orb: {
    toggleMain: () => ipcRenderer.send("orb:toggle-main"),
    filesDropped: (files) => ipcRenderer.send("orb:files-dropped", files),
    sync: (enabled) => ipcRenderer.send("orb:sync", enabled),
    moveBy: (dx, dy) => ipcRenderer.send("orb:move", { dx, dy }),
    savePosition: () => ipcRenderer.send("orb:save-position"),
  },

  mcp: {
    list: () => ipcRenderer.invoke("mcp:list"),
    add: (cfg) => ipcRenderer.invoke("mcp:add", cfg),
    remove: (name) => ipcRenderer.invoke("mcp:remove", name),
    tools: () => ipcRenderer.invoke("mcp:tools"),
  },

  publish: {
    state: () => ipcRenderer.invoke("publish:state"),
    publish: (botId) => ipcRenderer.invoke("publish:publish", botId),
    access: (payload) => ipcRenderer.invoke("publish:access", payload),
    unpublish: (botId) => ipcRenderer.invoke("publish:unpublish", botId),
  },

  teach: {
    start: (intervalMs) => ipcRenderer.invoke("teach:start", { intervalMs }),
    stop: (id) => ipcRenderer.invoke("teach:stop", { id }),
  },

  forms: {
    resolve: (id, values, approved) => ipcRenderer.send("form:resolve", { id, values, approved }),
  },

  files: {
    openViewer: (filePath) => ipcRenderer.invoke("files:openViewer", filePath),
  },

  mcpMarketplace: {
    list: () => ipcRenderer.invoke("mcp:marketplace"),
    add: (payload) => ipcRenderer.invoke("mcp:addFromMarketplace", payload),
    setInstructions: (payload) => ipcRenderer.invoke("mcp:setInstructions", payload),
    setToolEnabled: (payload) => ipcRenderer.invoke("mcp:setToolEnabled", payload),
    restart: (name) => ipcRenderer.invoke("mcp:restart", name),
  },

  plugins: {
    list: () => ipcRenderer.invoke("plugins:list"),
    toggle: (payload) => ipcRenderer.invoke("plugins:toggle", payload),
    uninstall: (id) => ipcRenderer.invoke("plugins:uninstall", id),
    installFile: () => ipcRenderer.invoke("plugins:installFile"),
  },

  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    upsert: (skill) => ipcRenderer.invoke("skills:upsert", skill),
    remove: (id) => ipcRenderer.invoke("skills:remove", id),
  },

  calendar: {
    list: () => ipcRenderer.invoke("calendar:list"),
    upsert: (ev) => ipcRenderer.invoke("calendar:upsert", ev),
    remove: (id) => ipcRenderer.invoke("calendar:remove", id),
    exportIcs: () => ipcRenderer.invoke("calendar:exportIcs"),
    importIcs: () => ipcRenderer.invoke("calendar:importIcs"),
  },

  contacts: {
    list: () => ipcRenderer.invoke("contacts:list"),
    upsert: (contact) => ipcRenderer.invoke("contacts:upsert", contact),
    remove: (id) => ipcRenderer.invoke("contacts:remove", id),
  },

  canvas: {
    open: (html) => ipcRenderer.send("canvas:open", html),
  },

  integrations: {
    reposTest: (payload) => ipcRenderer.invoke("repos:test", payload),
    slackTest: (token) => ipcRenderer.invoke("slack:test", token),
    teamsStartDeviceCode: () => ipcRenderer.invoke("teams:startDeviceCode"),
    teamsPollToken: (deviceCode) => ipcRenderer.invoke("teams:pollToken", deviceCode),
    teamsMe: () => ipcRenderer.invoke("teams:me"),
    opStatus: () => ipcRenderer.invoke("op:status"),
    imessagePlatform: () => ipcRenderer.invoke("imessage:platform"),
    remoteGenerateKey: (name) => ipcRenderer.invoke("remote:generateKey", name),
    remoteTest: (cfg) => ipcRenderer.invoke("remote:test", cfg),
    licenseActivate: (key) => ipcRenderer.invoke("license:activate", key),
    licenseStatus: () => ipcRenderer.invoke("license:status"),
  },

  sandbox: {
    probe: () => ipcRenderer.invoke("sandbox:probe"),
    install: () => ipcRenderer.invoke("sandbox:install"),
    reset: () => ipcRenderer.invoke("sandbox:reset"),
    setTarget: (target) => ipcRenderer.send("sandbox:setTarget", target),
  },

  automations: {
    webhookEnable: (id, enable) => ipcRenderer.invoke("automations:webhookEnable", { id, enable }),
    webhookPort: () => ipcRenderer.invoke("automations:webhookPort"),
    runNow: (id) => ipcRenderer.invoke("automations:runNow", id),
  },

  botScreen: {
    get: (botId) => ipcRenderer.invoke("bots:screen", botId),
  },

  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    install: () => ipcRenderer.send("updater:install"),
    openReleases: () => ipcRenderer.invoke("updater:openReleases"),
    onStatus: (handler) => {
      const listener = (_e, payload) => handler(payload);
      ipcRenderer.on("updater:event", listener);
      return () => ipcRenderer.removeListener("updater:event", listener);
    },
  },

  onSettingsPush: (handler) => {
    const listener = (_e, settings) => handler(settings);
    ipcRenderer.on("settings:push", listener);
    return () => ipcRenderer.removeListener("settings:push", listener);
  },

  onNavigate: (handler) => {
    const listener = (_e, hash) => handler(hash);
    ipcRenderer.on("navigate", listener);
    return () => ipcRenderer.removeListener("navigate", listener);
  },
  onFilesDropped: (handler) => {
    const listener = (_e, files) => handler(files);
    ipcRenderer.on("files-dropped", listener);
    return () => ipcRenderer.removeListener("files-dropped", listener);
  },
};

contextBridge.exposeInMainWorld("emberling", api);
