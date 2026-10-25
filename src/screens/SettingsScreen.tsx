import React, { useState } from "react";
import { useApp } from "../state";
import type { ProviderInfo } from "../types";
import { BUBBLE_COLORS } from "../types";
import { IconSettings, IconBell, IconBrain, IconBot, IconKey, IconShield, IconMic, IconInfo, IconCheck, IconPlug, IconClock } from "../components/Icons";
import { LogoMark, Wordmark } from "../components/Brand";
import { LANGUAGES } from "../i18n";
import type { UsageRow, McpConfig } from "../types";

type Section = "general" | "account" | "notifications" | "appearance" | "voice" | "mcp" | "usage" | "about";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <IconSettings size={14} /> },
  { id: "account", label: "Account", icon: <IconKey size={14} /> },
  { id: "notifications", label: "Notifications", icon: <IconBell size={14} /> },
  { id: "appearance", label: "Appearance", icon: <IconBrain size={14} /> },
  { id: "voice", label: "Voice", icon: <IconMic size={14} /> },
  { id: "mcp", label: "MCP servers", icon: <IconPlug size={14} /> },
  { id: "usage", label: "Usage", icon: <IconClock size={14} /> },
  { id: "about", label: "About", icon: <IconInfo size={14} /> },
];

function ProviderCard({ provider }: { provider: ProviderInfo }) {
  const { settings, setSettings, toast } = useApp();
  const creds = settings.providers[provider.id] || {};
  const [apiKey, setApiKey] = useState(creds.apiKey || "");
  const [model, setModel] = useState(creds.model || provider.models[0]?.id || "");
  const [baseUrl, setBaseUrl] = useState(creds.baseUrl || "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const isActive = settings.activeProvider === provider.id;
  const configured = !!creds.apiKey;

  const save = () => {
    setSettings((s) => ({
      ...s,
      providers: { ...s.providers, [provider.id]: { apiKey: apiKey.trim(), model: model || provider.models[0]?.id || "", baseUrl: baseUrl.trim() || undefined } },
      activeProvider: apiKey.trim() && !s.activeProvider ? provider.id : s.activeProvider,
    }));
    toast(`${provider.name} key saved`);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await window.emberling.providers.test({ providerId: provider.id, apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model });
    setTestResult({ ok: res.ok, msg: res.ok ? `Works: "${res.sample || ""}"` : res.error || "failed" });
    setTesting(false);
  };

  return (
    <div className="settings-group" style={{ borderColor: isActive ? "rgba(89,156,231,0.5)" : undefined }}>
      <div className="settings-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <strong style={{ flex: 1 }}>{provider.name}</strong>
          {isActive && <span className="badge ok">Active</span>}
          {configured && !isActive && (
            <button
              className="btn subtle"
              onClick={() => setSettings((s) => ({ ...s, activeProvider: provider.id }))}
            >
              Use
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap" }}>
          <input
            className="text-input"
            style={{ flex: 1, minWidth: 200 }}
            type="password"
            placeholder={provider.id === "custom" ? "API key (optional)" : "API key"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <select className="text-input" value={model} onChange={(e) => setModel(e.target.value)}>
            {(provider.models.length ? provider.models : [{ id: model || "custom-model", name: model || "custom-model", note: "" }]).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="">custom…</option>
          </select>
          {provider.id === "custom" && (
            <input className="text-input" style={{ flex: 1, minWidth: 200 }} placeholder="Base URL https://…/v1/chat/completions" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          )}
        </div>
        {!["custom"].includes(provider.id) && model === "" && (
          <input className="text-input" style={{ width: "100%" }} placeholder="Custom model id" value={model} onChange={(e) => setModel(e.target.value)} />
        )}
        {provider.keyUrl && (
          <div style={{ fontSize: 12, color: "var(--cursor-text-tertiary)" }}>
            Free key:{" "}
            <a href={provider.keyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--cursor-blue)" }}>
              {provider.keyUrl}
            </a>
          </div>
        )}
        {testResult && (
          <div style={{ fontSize: 12, color: testResult.ok ? "var(--cursor-green)" : "var(--cursor-danger)", wordBreak: "break-all" }}>{testResult.msg}</div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn primary" onClick={save} disabled={!apiKey.trim() && provider.id !== "custom" && !(provider as any).keyless}>
            {(provider as any).keyless ? "Use this provider" : "Save key"}
          </button>
          <button className="btn" onClick={test} disabled={testing}>
            {testing ? "Testing…" : "Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  run_command: "Run shell commands",
  read_file: "Read files",
  write_file: "Write files",
  edit_file: "Edit files",
  list_dir: "List directories",
  web_search: "Web search",
  web_fetch: "Web fetch",
  generate_photo: "Generate photos",
  generate_video: "Generate clips",
  screenshot: "Screenshots (app)",
  screen_screenshot: "Screenshots (screen)",
  spawn_subagent: "Subagents",
  react_to_message: "React to messages",
  request_user_form: "Ask with forms",
  send_email: "Compose email",
  list_windows: "List windows",
  focus_window: "Focus windows",
  type_text: "Type keystrokes",
  save_memory: "Save memories",
};

export function SettingsScreen() {
  const app = useApp();
  const { settings, setSettings, providers } = app;
  const initial = (app.route as any).section as Section | undefined;
  const [section, setSection] = useState<Section>(initial && SECTIONS.some((s) => s.id === initial) ? initial : "general");

  return (
    <div className="screen">
      <div className="screen-nav">
        {SECTIONS.map((s) => (
          <button key={s.id} className={`nav-row${section === s.id ? " active" : ""}`} onClick={() => setSection(s.id)}>
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>
      <div className="screen-content">
        {section === "general" && (
          <>
            <h2>General</h2>
            <div className="screen-sub">Free API providers — add a key, test it, and chat. Keys stay on this computer.</div>
            {providers.map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}
            <div className="settings-group">
              <div className="settings-row">
                <div>
                  <div className="row-label">Approval mode</div>
                  <div className="row-sub">How Emberling asks before running commands or editing files.</div>
                </div>
                <select
                  className="text-input"
                  value={settings.approvalMode}
                  onChange={(e) => setSettings((s) => ({ ...s, approvalMode: e.target.value as any }))}
                >
                  <option value="ask">Ask before acting</option>
                  <option value="askRisky">Ask for risky actions</option>
                  <option value="auto">Act automatically</option>
                </select>
              </div>
              <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div>
                  <div className="row-label">Agent tools</div>
                  <div className="row-sub">Which capabilities the agent may use on your computer.</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {Object.entries(TOOL_LABELS).map(([id, label]) => {
                    const on = settings.agentTools.includes(id);
                    return (
                      <button
                        key={id}
                        className="chip-btn"
                        style={on ? { borderColor: "rgba(89,156,231,0.5)", color: "var(--cursor-text-primary)" } : undefined}
                        onClick={() =>
                          setSettings((s) => ({
                            ...s,
                            agentTools: on ? s.agentTools.filter((t) => t !== id) : [...s.agentTools, id],
                          }))
                        }
                      >
                        {on ? <IconCheck size={12} /> : <IconShield size={12} />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="row-label">Desktop mark</div>
                  <div className="row-sub">Show the draggable Emberling orb on your desktop.</div>
                </div>
                <button className={`toggle${settings.showOrb ? " on" : ""}`} onClick={() => setSettings((s) => ({ ...s, showOrb: !s.showOrb }))} />
              </div>
              <div className="settings-row">
                <div>
                  <div className="row-label">Language</div>
                  <div className="row-sub">Interface language for the app chrome.</div>
                </div>
                <select className="text-input" value={settings.language || "en"} onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value }))}>
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-row">
                <div>
                  <div className="row-label">Queue when offline</div>
                  <div className="row-sub">If the provider is unreachable, hold messages and send them when it recovers.</div>
                </div>
                <button className={`toggle${settings.queueOffline ? " on" : ""}`} onClick={() => setSettings((s) => ({ ...s, queueOffline: !s.queueOffline }))} />
              </div>
            </div>
          </>
        )}

        {section === "account" && (
          <>
            <h2>Account</h2>
            <div className="screen-sub">Local account — this rebuild has no vendor backend, everything stays on this machine.</div>
            <div className="settings-group">
              <div className="settings-row">
                <div>
                  <div className="row-label">Your name</div>
                  <div className="row-sub">Used in greetings and memories.</div>
                </div>
                <input className="text-input" value={settings.userName} onChange={(e) => setSettings((s) => ({ ...s, userName: e.target.value }))} placeholder="Your name" />
              </div>
              <div className="settings-row">
                <div>
                  <div className="row-label">Data location</div>
                  <div className="row-sub">Conversations, bots, memories and keys are stored locally in this app's data folder.</div>
                </div>
                <span className="badge neutral">Local only</span>
              </div>
              <div className="settings-row">
                <div>
                  <div className="row-label">Export everything</div>
                  <div className="row-sub">Download all conversations, bots, memories and automations as JSON.</div>
                </div>
                <button
                  className="btn"
                  onClick={async () => {
                    const dump = JSON.stringify(
                      {
                        conversations: await window.emberling.store.get("conversations"),
                        bots: await window.emberling.store.get("bots"),
                        memories: await window.emberling.store.get("memories"),
                        automations: await window.emberling.store.get("automations"),
                      },
                      null,
                      2
                    );
                    await window.emberling.dialog.saveExport({ defaultPath: "emberling-export.json", content: dump });
                  }}
                >
                  Export data
                </button>
              </div>
            </div>
          </>
        )}

        {section === "notifications" && (
          <>
            <h2>Notifications</h2>
            <div className="screen-sub">Desktop notifications and sounds.</div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">Notifications</div>
                <button className={`toggle${settings.notifications ? " on" : ""}`} onClick={() => setSettings((s) => ({ ...s, notifications: !s.notifications }))} />
              </div>
              <div className="settings-row">
                <div className="row-label">Sounds</div>
                <button className={`toggle${settings.sounds ? " on" : ""}`} onClick={() => setSettings((s) => ({ ...s, sounds: !s.sounds }))} />
              </div>
            </div>
          </>
        )}

        {section === "appearance" && (
          <>
            <h2>Appearance</h2>
            <div className="screen-sub">Message bubble color — pick your look, iMessage style.</div>
            <div className="settings-group">
              <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div className="row-label">Your bubble color</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {BUBBLE_COLORS.map((c) => (
                    <button
                      key={c.id}
                      title={c.label}
                      onClick={() => setSettings((s) => ({ ...s, bubbleColor: c.id }))}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: c.css,
                        border: settings.bubbleColor === c.id ? "2px solid var(--cursor-accent)" : "1px solid var(--cursor-stroke-tertiary)",
                      }}
                    />
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="msg-row user" style={{ padding: "4px 0" }}>
                    <div className="bubble user" style={{ ["--bubble-user-fill" as any]: BUBBLE_COLORS.find((c) => c.id === settings.bubbleColor)?.css }}>
                      Hey, this is how I look.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {section === "voice" && (
          <>
            <h2>Voice</h2>
            <div className="screen-sub">Voice memos record in chat; transcription uses a free Groq key (Whisper) when configured.</div>
            <div className="settings-group">
              <div className="settings-row">
                <div>
                  <div className="row-label">Transcription provider</div>
                  <div className="row-sub">Add a Groq API key in General to enable free Whisper transcription.</div>
                </div>
                <span className={`badge${settings.providers.groq?.apiKey ? " ok" : " warn"}`}>
                  {settings.providers.groq?.apiKey ? "Ready" : "Needs Groq key"}
                </span>
              </div>
            </div>
          </>
        )}

        {section === "mcp" && <McpSection />}

        {section === "usage" && <UsageSection />}

        {section === "about" && (
          <>
            <h2>About</h2>
            <div className="screen-sub">Rebuilt from static analysis (REA) of the original 0.75.8 client — same UI/UX language, powered by free API providers.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "16px 0 4px", padding: "14px 16px", background: "#141414", border: "1px solid var(--cursor-stroke-tertiary)", borderRadius: 12 }}>
              <LogoMark size={46} />
              <div>
                <Wordmark height={14} />
                <div style={{ fontSize: 12, color: "var(--cursor-text-tertiary)", marginTop: 4 }}>One bright ember in orbit — the desktop agent for your computer.</div>
              </div>
            </div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">Version</div>
                <span style={{ color: "var(--cursor-text-tertiary)" }}>0.75.8 (clone)</span>
              </div>
              <div className="settings-row">
                <div className="row-label">Electron / Chrome / Node</div>
                <span style={{ color: "var(--cursor-text-tertiary)" }}>
                  {window.emberling.versions.electron} / {window.emberling.versions.chrome} / {window.emberling.versions.node}
                </span>
              </div>
              <div className="settings-row">
                <div className="row-label">Design tokens</div>
                <span style={{ color: "var(--cursor-text-tertiary)" }}>Extracted from the original installer</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- MCP servers ---------------- */
function McpSection() {
  const { toast } = useApp();
  const [configs, setConfigs] = useState<McpConfig[]>([]);
  const [connected, setConnected] = useState<{ name: string; tools: number }[]>([]);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    const s = await window.emberling.mcp.list();
    setConfigs(s.configs || []);
    setConnected(s.connected || []);
  };
  React.useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!name.trim() || !command.trim()) return;
    setAdding(true);
    const res = await window.emberling.mcp.add({ name: name.trim(), command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [] });
    setAdding(false);
    if (res.ok) {
      toast(`MCP server "${name}" connected`);
      setName("");
      setCommand("");
      setArgs("");
      refresh();
    } else toast(res.error || "Failed to connect");
  };

  return (
    <>
      <h2>MCP servers</h2>
      <div className="screen-sub">
        Model Context Protocol servers extend the agent with external tools (filesystem, databases, APIs). They run locally over stdio, exactly like the original's MCP surface.
      </div>
      <div className="settings-group">
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <input className="text-input" style={{ width: "100%" }} placeholder="Server name (e.g. filesystem)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="text-input" style={{ width: "100%" }} placeholder="Command (e.g. npx -y @modelcontextprotocol/server-filesystem)" value={command} onChange={(e) => setCommand(e.target.value)} />
          <input className="text-input" style={{ width: "100%" }} placeholder="Arguments (optional, space-separated)" value={args} onChange={(e) => setArgs(e.target.value)} />
          <button className="btn primary" style={{ justifySelf: "start" }} onClick={add} disabled={adding || !name.trim() || !command.trim()}>
            {adding ? "Connecting…" : "Connect server"}
          </button>
        </div>
      </div>
      <div className="settings-group">
        {configs.length === 0 && <div className="list-item" style={{ color: "var(--cursor-text-quaternary)" }}>No MCP servers configured yet.</div>}
        {configs.map((c) => {
          const conn = connected.find((x) => x.name === c.name);
          return (
            <div className="list-item" key={c.name}>
              <div className="li-body">
                <div className="li-title">
                  {c.name} <span className={`badge${conn ? " ok" : " warn"}`}>{conn ? `${conn.tools} tools` : "offline"}</span>
                </div>
                <div className="li-sub" style={{ wordBreak: "break-all" }}>
                  {c.command} {c.args?.join(" ")}
                </div>
              </div>
              <button
                className="icon-btn"
                title="Remove"
                onClick={async () => {
                  await window.emberling.mcp.remove(c.name);
                  refresh();
                }}
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: "var(--cursor-text-quaternary)" }}>
        Connected tools appear to the agent automatically (named mcp_server_tool) and respect the approval mode.
      </div>
    </>
  );
}

/* ---------------- Usage ---------------- */
function UsageSection() {
  const { settings, setSettings } = useApp();
  const [usage, setUsage] = React.useState<UsageRow[]>([]);
  React.useEffect(() => {
    window.emberling.store.get("usage").then((u) => setUsage(Array.isArray(u) ? u : []));
  }, []);

  const totalIn = usage.reduce((a, r) => a + r.tokensIn, 0);
  const totalOut = usage.reduce((a, r) => a + r.tokensOut, 0);
  const totalTurns = usage.reduce((a, r) => a + r.turns, 0);
  const maxTokens = Math.max(...usage.map((r) => r.tokensIn + r.tokensOut), 1);

  return (
    <>
      <h2>Usage</h2>
      <div className="screen-sub">Tokens across your free providers, tracked locally. The original's billing screen — minus the bill.</div>
      <div className="settings-group">
        <div className="settings-row">
          <div className="row-label">Turns</div>
          <span>{totalTurns}</span>
        </div>
        <div className="settings-row">
          <div className="row-label">Tokens in / out</div>
          <span>
            {totalIn.toLocaleString()} / {totalOut.toLocaleString()}
          </span>
        </div>
        <div className="settings-row">
          <div className="row-label">Plan</div>
          {settings.plus ? (
            <span className="badge ok">Emberling Plus — everything unlocked</span>
          ) : (
            <button
              className="btn primary"
              onClick={() => setSettings((s) => ({ ...s, plus: true }))}
              title="Everything in this clone is already free — this just unlocks the Plus badge"
            >
              ✨ Get Emberling Plus (free)
            </button>
          )}
        </div>
      </div>
      <div className="settings-group">
        {usage.length === 0 && <div className="list-item" style={{ color: "var(--cursor-text-quaternary)" }}>No usage recorded yet — chat with the agent to see it here.</div>}
        {[...usage].reverse().slice(0, 14).map((r) => (
          <div className="list-item" key={r.day}>
            <div className="li-body">
              <div className="li-title">{r.day}</div>
              <div className="li-sub">
                {r.turns} turns · {r.tokensIn.toLocaleString()} in · {r.tokensOut.toLocaleString()} out
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--cursor-bg-quinary)", marginTop: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${((r.tokensIn + r.tokensOut) / maxTokens) * 100}%`, background: "linear-gradient(90deg, #f54e00, #ff8a4c)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
