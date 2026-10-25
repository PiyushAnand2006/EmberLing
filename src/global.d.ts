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
      send(payload: { conversationId: string; history: { role: string; content: string }[]; botId?: string; mode?: string }): Promise<{ ok: boolean; error?: string; stopped?: boolean }>;
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
    onNavigate(handler: (hash: string) => void): () => void;
    onFilesDropped(handler: (files: string[]) => void): () => void;
    onSettingsPush(handler: (settings: any) => void): () => void;
  }

  interface Window {
    emberling: EmberlingApi;
  }
}
