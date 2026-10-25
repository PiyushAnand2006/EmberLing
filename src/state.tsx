import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Conversation, Bot, Memory, Automation, Settings, IntegrationState, ProviderInfo } from "./types";

interface Toast {
  id: number;
  text: string;
}

interface AppState {
  conversations: Conversation[];
  bots: Bot[];
  memories: Memory[];
  automations: Automation[];
  settings: Settings;
  integrations: IntegrationState;
  providers: ProviderInfo[];
  activeConversationId: string | null;
  route: Route;
  toasts: Toast[];
  setConversations: (fn: (c: Conversation[]) => Conversation[]) => void;
  setBots: (fn: (b: Bot[]) => Bot[]) => void;
  setMemories: (fn: (m: Memory[]) => Memory[]) => void;
  setAutomations: (fn: (a: Automation[]) => Automation[]) => void;
  setSettings: (fn: (s: Settings) => Settings) => void;
  setIntegrations: (fn: (i: IntegrationState) => IntegrationState) => void;
  setActiveConversationId: (id: string | null) => void;
  navigate: (route: Route) => void;
  toast: (text: string) => void;
}

export type Route =
  | { kind: "chat" }
  | { kind: "settings"; section?: string }
  | { kind: "bots" }
  | { kind: "memories" }
  | { kind: "automations" }
  | { kind: "integrations" }
  | { kind: "onboarding" };

const Ctx = createContext<AppState | null>(null);

const FALLBACK_SETTINGS: Settings = {
  activeProvider: "pollinations",
  providers: {},
  approvalMode: "ask",
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversationsRaw] = useState<Conversation[]>([]);
  const [bots, setBotsRaw] = useState<Bot[]>([]);
  const [memories, setMemoriesRaw] = useState<Memory[]>([]);
  const [automations, setAutomationsRaw] = useState<Automation[]>([]);
  const [settings, setSettingsRaw] = useState<Settings>(FALLBACK_SETTINGS);
  const [integrations, setIntegrationsRaw] = useState<IntegrationState>({ connected: {} });
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ kind: "chat" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, b, m, a, s, i, p] = await Promise.all([
        window.emberling.store.get("conversations"),
        window.emberling.store.get("bots"),
        window.emberling.store.get("memories"),
        window.emberling.store.get("automations"),
        window.emberling.store.get("settings"),
        window.emberling.store.get("integrations"),
        window.emberling.providers.list(),
      ]);
      setConversationsRaw(Array.isArray(c) ? c : []);
      setBotsRaw(Array.isArray(b) ? b : []);
      setMemoriesRaw(Array.isArray(m) ? m : []);
      setAutomationsRaw(Array.isArray(a) ? a : []);
      setSettingsRaw({ ...FALLBACK_SETTINGS, ...(s || {}) });
      setIntegrationsRaw(i || { connected: {} });
      setProviders(p || []);
      if (!s?.onboardingDone) setRoute({ kind: "onboarding" });
      setLoaded(true);
    })();
  }, []);

  // persist on change after initial load
  useEffect(() => {
    if (loaded) window.emberling.store.set("conversations", conversations);
  }, [conversations, loaded]);
  useEffect(() => {
    if (loaded) window.emberling.store.set("bots", bots);
  }, [bots, loaded]);
  useEffect(() => {
    if (loaded) window.emberling.store.set("memories", memories);
  }, [memories, loaded]);
  useEffect(() => {
    if (loaded) window.emberling.store.set("automations", automations);
  }, [automations, loaded]);
  useEffect(() => {
    if (loaded) window.emberling.store.set("settings", settings);
  }, [settings, loaded]);
  useEffect(() => {
    if (loaded) window.emberling.store.set("integrations", integrations);
  }, [integrations, loaded]);

  const toast = useCallback((text: string) => {
    const t = new Uint32Array(1);
    crypto.getRandomValues(t);
    const id = Date.now() + t[0];
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const navigate = useCallback((r: Route) => {
    setRoute(r);
    if (r.kind === "chat") {
      // keep current conversation
    }
  }, []);

  useEffect(() => {
    const off = window.emberling.onNavigate((hash: string) => {
      if (hash === "new") {
        setActiveConversationId(null);
        setRoute({ kind: "chat" });
      } else if (hash === "settings") setRoute({ kind: "settings" });
      else if (hash.startsWith("chat/")) {
        setActiveConversationId(hash.slice(5));
        setRoute({ kind: "chat" });
      }
    });
    return off;
  }, []);

  // keep orb visibility in sync with settings (tray can toggle it from main)
  useEffect(() => {
    if (loaded) window.emberling.orb.sync(settings.showOrb);
  }, [settings.showOrb, loaded]);

  // apply settings pushed from the main process (e.g. tray orb toggle)
  useEffect(() => {
    return window.emberling.onSettingsPush((pushed) => {
      if (pushed && typeof pushed === "object") setSettingsRaw((cur) => ({ ...cur, ...pushed }));
    });
  }, []);

  const value: AppState = {
    conversations,
    bots,
    memories,
    automations,
    settings,
    integrations,
    providers,
    activeConversationId,
    route,
    toasts,
    setConversations: (fn) => setConversationsRaw((c) => fn(c)),
    setBots: (fn) => setBotsRaw((b) => fn(b)),
    setMemories: (fn) => setMemoriesRaw((m) => fn(m)),
    setAutomations: (fn) => setAutomationsRaw((a) => fn(a)),
    setSettings: (fn) => setSettingsRaw((s) => fn(s)),
    setIntegrations: (fn) => setIntegrationsRaw((i) => fn(i)),
    setActiveConversationId,
    navigate,
    toast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function uid() {
  // UI-scoped identifiers; crypto RNG keeps them unpredictable anyway
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${Date.now().toString(36)}-${[...bytes].map((b) => b.toString(36).padStart(2, "0")).join("")}`;
}
