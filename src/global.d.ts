export {};

declare global {
  interface EmberlingApi {
    platform: string;
    versions: { electron: string; chrome: string; node: string };
    window: { minimize(): void; maximize(): void; close(): void };
    store: {
      get(collection: string): Promise<any>;
      set(collection: string, value: any): Promise<boolean>;
    };
    providers: {
      list(): Promise<any[]>;
      test(payload: { providerId: string; apiKey: string; baseUrl?: string; model?: string }): Promise<{ ok: boolean; sample?: string; error?: string }>;
      fetchModels(payload: { providerId: string; apiKey: string; baseUrl?: string }): Promise<{ ok: boolean; models?: string[]; error?: string }>;
    };
    agent: {
      send(payload: { conversationId: string; history: { role: string; content: string }[]; botId?: string; roomBots?: string[]; mode?: string }): Promise<{ ok: boolean; error?: string; stopped?: boolean }>;
      stop(conversationId: string): void;
      resolveApproval(id: string, approved: boolean): void;
      onEvent(handler: (evt: any) => void): () => void;
    };
    media: {
      save(payload: { name: string; dataBase64: string }): Promise<{ id: string; url: string }>;
      readText(filePath: string): Promise<{ ok: boolean; content?: string; name?: string; size?: number; error?: string }>;
    };
    dialog: {
      pickFiles(): Promise<string[]>;
      saveExport(payload: { defaultPath: string; content: string }): Promise<boolean>;
    };
    voice: {
      transcribe(payload: { mediaId: string; mimeType: string }): Promise<{ ok: boolean; text?: string; error?: string }>;
    };
  orb: {
    toggleMain(): void;
    filesDropped(files: string[]): void;
    sync(enabled: boolean): void;
    moveBy(dx: number, dy: number): void;
    savePosition(): void;
    /** hover intent on the desktop mark — shows/hides the preview bubble */
    hover(on: boolean): void;
    /** preview bubble content pushed from main when the bubble shows */
    onPreviewData(cb: (d: { title: string; snippet: string } | null) => void): void;
  };
  mcp: {
    list(): Promise<{ configs: any[]; connected: { name: string; tools: number }[] }>;
    add(cfg: { name: string; command: string; args: string[] }): Promise<{ ok: boolean; error?: string }>;
    remove(name: string): Promise<{ ok: boolean }>;
    tools(): Promise<{ name: string; description: string; server: string }[]>;
  };
  publish: {
    state(): Promise<any>;
    publish(botId: string): Promise<{ ok: boolean; url?: string; access?: string; error?: string }>;
    access(payload: { botId: string; access: string }): Promise<{ ok: boolean; url?: string }>;
    unpublish(botId: string): Promise<{ ok: boolean }>;
  };
  teach: {
    start(intervalMs?: number): Promise<{ ok: boolean; id: string }>;
    stop(id: string): Promise<{ ok: boolean; shots: string[] }>;
  };
  forms: {
    resolve(id: string, values: Record<string, unknown>, approved: boolean): void;
  };
  files: {
    openViewer(filePath: string): Promise<boolean>;
  };
  mcpMarketplace: {
    list(): Promise<any[]>;
    add(payload: { name: string; placeholderValue?: string }): Promise<{ ok: boolean; tools?: string[]; error?: string }>;
    setInstructions(payload: { name: string; instructions: string }): Promise<{ ok: boolean }>;
    setToolEnabled(payload: { server: string; tool: string; enabled: boolean }): Promise<{ ok: boolean }>;
    restart(name: string): Promise<{ ok: boolean; error?: string }>;
  };
  plugins: {
    list(): Promise<any[]>;
    toggle(payload: { id: string; enabled: boolean }): Promise<{ ok: boolean }>;
    uninstall(id: string): Promise<{ ok: boolean }>;
    installFile(): Promise<{ ok: boolean; id?: string; tools?: string[]; error?: string }>;
  };
  skills: {
    list(): Promise<any[]>;
    upsert(skill: any): Promise<{ ok: boolean; id: string }>;
    remove(id: string): Promise<{ ok: boolean }>;
  };
  calendar: {
    list(): Promise<any[]>;
    upsert(ev: any): Promise<{ ok: boolean; id: string }>;
    remove(id: string): Promise<{ ok: boolean }>;
    exportIcs(): Promise<{ ok: boolean; path?: string; error?: string }>;
    importIcs(): Promise<{ ok: boolean; imported?: number; error?: string }>;
  };
  contacts: {
    list(): Promise<any[]>;
    upsert(contact: any): Promise<{ ok: boolean; id: string }>;
    remove(id: string): Promise<{ ok: boolean }>;
  };
  canvas: {
    open(html: string): void;
  };
  integrations: {
    reposTest(payload: { provider: string; token: string; org?: string }): Promise<{ ok: boolean; repos?: any[]; error?: string }>;
    slackTest(token: string): Promise<{ ok: boolean; user?: string; team?: string; error?: string }>;
    teamsStartDeviceCode(): Promise<{ deviceCode?: string; userCode?: string; verifyUrl?: string; error?: string }>;
    teamsPollToken(deviceCode: string): Promise<{ ok: boolean; pending?: boolean; error?: string; restart?: { deviceCode: string; userCode?: string; verifyUrl?: string }; note?: string }>;
    teamsMe(): Promise<{ name?: string; mail?: string; error?: string }>;
    opStatus(): Promise<{ available: boolean; version?: string; error?: string }>;
    imessagePlatform(): Promise<{ isMac: boolean; platform: string }>;
    remoteGenerateKey(name: string): Promise<{ publicKey?: string; privateKeyPath?: string; error?: string }>;
    remoteTest(cfg: { name: string; host: string; port?: number; user: string }): Promise<{ ok: boolean; detail?: string; error?: string }>;
    licenseActivate(key: string): Promise<{ ok: boolean; name?: string; error?: string }>;
    licenseStatus(): Promise<{ plus: boolean; holder: string }>;
  };
  sandbox: {
    probe(): Promise<{ state: "missing-wsl" | "no-distro" | "ready" | "error"; distros: string[]; distro: string | null; hint: string | null }>;
    install(): Promise<{ ok: boolean; note: string }>;
    reset(): Promise<{ ok: boolean; note?: string; error?: string }>;
    setTarget(target: "local" | "remote" | "sandbox"): void;
  };
  automations: {
    webhookEnable(id: string, enable: boolean): Promise<{ ok: boolean; enabled?: boolean; url?: string | null; note?: string; error?: string }>;
    webhookPort(): Promise<number | null>;
    runNow(id: string): Promise<{ ok: boolean; error?: string }>;
    slackChannels(): Promise<{ ok: boolean; channels?: { id: string; name: string }[]; error?: string }>;
  };
  botScreen: {
    get(botId: string): Promise<{
      screen: { ts?: number; tool?: string; cmd?: string; exitCode?: number | null; out?: string; trail?: { ts: number; tool?: string; cmd?: string; out?: string }[] };
      acting: boolean;
      routines: { id: string; name: string; enabled: boolean; schedule: string; nextJoin: string | null }[];
    }>;
  };
  updater: {
    check(): Promise<{ ok: boolean; current: string; latest?: string; updateAvailable?: boolean; state?: string; portable: boolean; error?: string }>;
    install(): void;
    openReleases(): Promise<void>;
    onStatus(handler: (payload: { state: "downloading" | "ready" | "available" | "error"; version?: string; percent?: number; portable?: boolean; message?: string }) => void): () => void;
  };
    onNavigate(handler: (hash: string) => void): () => void;
    onFilesDropped(handler: (files: string[]) => void): () => void;
    onSettingsPush(handler: (settings: any) => void): () => void;
  }

  interface Window {
    emberling: EmberlingApi;
  }
}
