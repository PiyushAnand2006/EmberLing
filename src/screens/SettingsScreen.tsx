import React, { useEffect, useState } from "react";
import { useApp } from "../state";
import type { ProviderInfo } from "../types";
import { BUBBLE_COLORS } from "../types";
import { IconSettings, IconBell, IconBrain, IconBot, IconKey, IconShield, IconMic, IconInfo, IconCheck, IconPlug, IconClock, IconSparkles, IconX } from "../components/Icons";
import { LogoMark, Wordmark } from "../components/Brand";
import { LANGUAGES } from "../i18n";
import type { UsageRow, McpConfig } from "../types";

type Section = "general" | "account" | "notifications" | "appearance" | "voice" | "mcp" | "plugins" | "usage" | "about";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <IconSettings size={14} /> },
  { id: "account", label: "Account", icon: <IconKey size={14} /> },
  { id: "notifications", label: "Notifications", icon: <IconBell size={14} /> },
  { id: "appearance", label: "Appearance", icon: <IconBrain size={14} /> },
  { id: "voice", label: "Voice", icon: <IconMic size={14} /> },
  { id: "mcp", label: "MCP servers", icon: <IconPlug size={14} /> },
  { id: "plugins", label: "Plugins", icon: <IconSparkles size={14} /> },
  { id: "usage", label: "Usage", icon: <IconClock size={14} /> },
  { id: "about", label: "About", icon: <IconInfo size={14} /> },
];

// Auto-update status + manual check. Background progress also lands here via
// the shared updater events, so the row mirrors the chat banner.
function UpdatesRow() {
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(
    () =>
      window.emberling.updater.onStatus((p) => {
        if (p.state === "downloading") setNote(`Downloading v${p.version || "update"}${p.percent != null ? ` — ${p.percent}%` : "…"}`);
        else if (p.state === "ready") setNote(`v${p.version} ready — restart to update`);
        else if (p.state === "available") setNote(`v${p.version} available`);
      }),
    []
  );
  const check = async () => {
    setChecking(true);
    try {
      const res = await window.emberling.updater.check();
      if (!res.ok) setNote(`Check failed: ${res.error || "unknown error"}`);
      else if (res.state === "dev") setNote(`Dev mode — updater disabled (v${res.current})`);
      else if (res.state === "unavailable") setNote(`v${res.current} — updater unavailable`);
      else if (res.updateAvailable) setNote(`v${res.latest} available — downloading…`);
      else setNote(`Up to date (v${res.current})`);
    } catch (err: any) {
      setNote(`Check failed: ${String(err?.message || err).slice(0, 120)}`);
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="settings-row">
      <div className="row-label">Updates</div>
      <span style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--cursor-text-tertiary)" }}>
        <span>{note || "Automatic — checked at launch and every 6 hours"}</span>
        <button className="btn" onClick={check} disabled={checking}>
          {checking ? "Checking…" : "Check now"}
        </button>
      </span>
    </div>
  );
}

// Linux sandbox (WSL) — the agent's local Linux box. Mirrors the original's
// cloud-box setup flow: explicit download step from Settings, enable toggle,
// one-time provisioning, and a reset action. While the sandbox is not ready,
// agent commands fall back to this computer with a note.
// Auto-review rules (the original's auto-review selector): pattern-based
// allow/deny/ask overrides evaluated before the approval mode. Patterns match
// against "toolName + arguments"; /.../ syntax is treated as a regex.
function AutoReviewRules() {
  const { settings, setSettings, toast } = useApp();
  const rules: { pattern: string; action: string }[] = Array.isArray((settings as any).autoReviewRules) ? (settings as any).autoReviewRules : [];
  const [draft, setDraft] = useState("");

  const update = (next: { pattern: string; action: string }[]) => {
    setSettings((s: any) => ({ ...s, autoReviewRules: next }));
  };
  const add = () => {
    const pattern = draft.trim();
    if (!pattern) return;
    if (pattern.startsWith("/") && !pattern.endsWith("/")) {
      toast("Regex rules must look like /pattern/");
      return;
    }
    update([...rules, { pattern, action: "ask" }]);
    setDraft("");
  };

  return (
    <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div>
        <div className="row-label">Auto-review rules</div>
        <div className="row-sub">
          Override the approval mode for specific tools — e.g. allow <code>git status</code>, always ask before <code>npm publish</code>. Plain text matches
          anywhere in the tool call; /regex/ for advanced matching. First match wins.
        </div>
      </div>
      {rules.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {rules.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ flex: 1, fontSize: 12, color: "var(--cursor-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.pattern}
              </code>
              <select
                className="text-input"
                style={{ width: 110 }}
                value={r.action}
                onChange={(e) => update(rules.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))}
              >
                <option value="allow">Auto-allow</option>
                <option value="ask">Always ask</option>
                <option value="deny">Deny</option>
              </select>
              <button className="icon-btn" onClick={() => update(rules.filter((_, j) => j !== i))}>
                <IconX size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder="e.g. git status  ·  /npm (publish|install -g)/"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn" onClick={add}>
          Add rule
        </button>
      </div>
    </div>
  );
}

function SandboxCard() {
  const { settings, setSettings, toast } = useApp();
  const [probe, setProbe] = useState<any>(null);
  const [busy, setBusy] = useState<"" | "probe" | "install" | "reset">("");
  const enabled = settings.executionTarget === "sandbox";

  const refresh = async () => {
    setBusy("probe");
    try {
      setProbe(await window.emberling.sandbox.probe());
    } catch (err: any) {
      setProbe({ state: "error", hint: String(err?.message || err).slice(0, 120) });
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async () => {
    setBusy("install");
    try {
      const res = await window.emberling.sandbox.install();
      toast(res.note || "Sandbox setup started");
    } catch (err: any) {
      toast(String(err?.message || err).slice(0, 120));
    } finally {
      setBusy("");
      setTimeout(refresh, 1500);
    }
  };

  const reset = async () => {
    if (!confirm("Reset the Linux sandbox? This deletes the WSL distribution and everything inside it.")) return;
    setBusy("reset");
    try {
      const res = await window.emberling.sandbox.reset();
      toast(res.ok ? res.note || "Sandbox reset" : res.error || "Reset failed");
      if (res.ok && enabled) window.emberling.sandbox.setTarget("local");
    } finally {
      setBusy("");
      refresh();
    }
  };

  const toggle = () => {
    const next = !enabled;
    if (next && probe?.state !== "ready") {
      toast("The sandbox is not ready yet — finish the setup below first");
      return;
    }
    window.emberling.sandbox.setTarget(next ? "sandbox" : "local");
    setSettings((s: any) => ({ ...s, executionTarget: next ? "sandbox" : "local" }));
    toast(next ? "Agent commands now run in the Linux sandbox" : "Agent commands run on this computer");
  };

  const statusText =
    busy === "probe"
      ? "Checking WSL status…"
      : probe?.state === "ready"
        ? `Ready — ${probe.distro}`
        : probe?.state === "missing-wsl"
          ? "WSL is not installed on this PC"
          : probe?.state === "no-distro"
            ? "WSL is present but no Linux distribution is installed yet"
            : probe?.state === "error"
              ? `Error: ${probe.hint}`
              : "…";

  return (
    <div className="settings-group">
      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div className="row-label">Linux sandbox (WSL)</div>
            <div className="row-sub">{statusText}</div>
          </div>
          <button className={`toggle${enabled ? " on" : ""}`} onClick={toggle} title={enabled ? "Sandbox execution on" : "Run agent commands in the sandbox"} />
        </div>
        <div className="row-sub" style={{ color: "var(--cursor-text-tertiary)" }}>
          {enabled
            ? "Each Dotling gets its own private Linux VM (cloned from this image on first use). Commands, automations and tests run inside the VM without asking — the VM boundary is the isolation. While a VM is unavailable, tools fall back to this computer with a note."
            : "Give each Dotling an isolated Linux VM for builds, automations and experiments. The base image downloads once, from Settings — nothing leaves this PC."}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {probe?.state !== "ready" && (
            <button className="btn primary" onClick={install} disabled={busy !== ""}>
              {busy === "install" ? "Installing…" : probe?.state === "missing-wsl" ? "Install WSL + Ubuntu" : "Install Ubuntu (download)"}
            </button>
          )}
          <button className="btn" onClick={refresh} disabled={busy !== ""}>
            {busy === "probe" ? "Checking…" : "Refresh status"}
          </button>
          {probe?.state === "ready" && (
            <button className="btn" onClick={reset} disabled={busy !== ""}>
              {busy === "reset" ? "Resetting…" : "Reset sandbox"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderInfo }) {  const { settings, setSettings, toast } = useApp();
  const creds = settings.providers[provider.id] || {};
  const [apiKey, setApiKey] = useState(creds.apiKey || "");
  const [model, setModel] = useState(creds.model || provider.models[0]?.id || "");
  const [baseUrl, setBaseUrl] = useState(creds.baseUrl || "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const [modelsNote, setModelsNote] = useState("");
  const isActive = settings.activeProvider === provider.id;
  const configured = !!creds.apiKey || !!(provider as any).keyless;

  // auto-load the provider's live model list when a key is available;
  // discovered ids persist into settings so the chat model menu sees them too
  const loadModels = async (keyOverride?: string) => {
    if ((provider as any).keyless) return;
    const key = (keyOverride ?? apiKey).trim();
    if (!key && provider.id !== "custom") return;
    setModelsNote("loading models…");
    const res = await window.emberling.providers.fetchModels({ providerId: provider.id, apiKey: key, baseUrl: baseUrl.trim() });
    if (res.ok && res.models?.length) {
      setLiveModels(res.models);
      setModelsNote(`${res.models.length} models loaded — shown in Settings and the chat model menu`);
      setSettings((s) => ({
        ...s,
        providers: { ...s.providers, [provider.id]: { ...(s.providers[provider.id] || {}), apiKey: s.providers[provider.id]?.apiKey ?? apiKey.trim(), models: res.models } },
      }));
    } else {
      setModelsNote(res.ok ? "" : `models not loaded: ${res.error || "unknown error"}`);
    }
  };

  // on mount, fetch for already-configured providers
  React.useEffect(() => {
    if (configured && creds.apiKey) loadModels(creds.apiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  const persist = (chosenModel: string) => {
    setSettings((s) => ({
      ...s,
      providers: { ...s.providers, [provider.id]: { apiKey: apiKey.trim(), model: chosenModel || provider.models[0]?.id || "", baseUrl: baseUrl.trim() || undefined } },
      activeProvider: apiKey.trim() && !s.activeProvider ? provider.id : s.activeProvider,
    }));
  };

  const save = async () => {
    persist(model || provider.models[0]?.id || "");
    toast(`${provider.name} saved`);
    // refresh the live model list right after the key lands
    await loadModels(apiKey.trim());
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await window.emberling.providers.test({ providerId: provider.id, apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model });
    setTestResult({ ok: res.ok, msg: res.ok ? `Works: "${res.sample || ""}"` : res.error || "failed" });
    setTesting(false);
    if (res.ok) await loadModels(apiKey.trim());
  };

  // merge static catalog + persisted + freshly discovered models
  const staticIds = provider.models.map((m) => (m as any).id);
  const persisted: string[] = creds.models || [];
  const discovered = [...new Set([...persisted, ...liveModels])].filter((id) => !staticIds.includes(id) && id !== model);
  // a custom-entered model id that isn't in any list still needs to DISPLAY
  const currentMissing = !!model && !staticIds.includes(model) && !discovered.includes(model);

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
            {(provider.models.length ? provider.models : staticIds.length ? [] : [{ id: model || "custom-model", name: model || "custom-model", note: "" }]).map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            {discovered.length > 0 && (
              <optgroup label={`Discovered from provider (${discovered.length})`}>
                {discovered.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </optgroup>
            )}
            {currentMissing && <option value={model}>{model} (current)</option>}
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
        {modelsNote && (
          <div style={{ fontSize: 12, color: "var(--cursor-text-tertiary)" }}>
            🔄 {modelsNote}
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
  ocr_image: "Read text from images (OCR)",
  spawn_subagent: "Subagents",
  react_to_message: "React to messages",
  request_user_form: "Ask with forms",
  send_email: "Compose email",
  list_windows: "List windows",
  focus_window: "Focus windows",
  type_text: "Type keystrokes",
  save_memory: "Save memories",
  browser_open: "Open web pages",
  browser_snapshot: "Read page structure",
  browser_click: "Click in browser",
  browser_type: "Type in browser",
  browser_scroll: "Scroll browser",
  browser_read: "Read page text",
  browser_screenshot: "Browser screenshots",
  browser_close: "Detach browser",
  store_write: "Agent store: write",
  store_read: "Agent store: read",
  store_list: "Agent store: list",
  store_search: "Agent store: search",
  store_versions: "Agent store: history",
  store_delete: "Agent store: delete",
  link_preview: "Link previews",
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
              <AutoReviewRules />
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
              <SandboxCard />
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

        {section === "plugins" && <PluginsSection />}

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
                <span style={{ color: "var(--cursor-text-tertiary)" }}>0.75.15 (clone)</span>
              </div>
              <UpdatesRow />
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
      <McpMarketplace configs={configs} onDone={refresh} />
      {configs.map((c) => (
        <McpServerControls key={c.name} config={c} connected={!!connected.find((x) => x.name === c.name)} onDone={refresh} />
      ))}
    </>
  );
}

/* Block B13: one-click marketplace + per-server instructions/tool toggles/restart */
function McpMarketplace({ configs, onDone }: { configs: McpConfig[]; onDone: () => void }) {
  const { toast } = useApp();
  const [catalog, setCatalog] = useState<any[]>([]);
  const [placeholderValue, setPlaceholderValue] = useState("");
  const [busy, setBusy] = useState("");
  React.useEffect(() => {
    window.emberling.mcpMarketplace.list().then(setCatalog);
  }, []);
  return (
    <div className="settings-group">
      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div className="row-label">Marketplace — one-click install</div>
        {catalog.some((m) => m.argsTemplate.some((a: string) => a.includes("{{dir}}"))) && (
          <input className="text-input" style={{ width: "100%" }} placeholder="Directory for filesystem server (optional)" value={placeholderValue} onChange={(e) => setPlaceholderValue(e.target.value)} />
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {catalog.map((m) => {
            const installed = configs.some((c) => c.name === m.name);
            return (
              <button
                key={m.name}
                className="chip-btn"
                title={m.desc}
                disabled={busy === m.name || installed}
                style={installed ? { opacity: 0.55 } : undefined}
                onClick={async () => {
                  setBusy(m.name);
                  const res = await window.emberling.mcpMarketplace.add({ name: m.name, placeholderValue });
                  setBusy("");
                  if (res.ok) {
                    toast(`${m.label} connected`);
                    onDone();
                  } else toast(res.error || "install failed");
                }}
              >
                {installed ? "✓ " : "+ "}
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function McpServerControls({ config, connected, onDone }: { config: McpConfig; connected: boolean; onDone: () => void }) {
  const { toast } = useApp();
  const [instructions, setInstructions] = useState(config.instructions || "");
  const [tools, setTools] = useState<{ name: string; description: string }[]>([]);
  React.useEffect(() => {
    if (connected) window.emberling.mcp.tools().then((all) => setTools(all.filter((t) => t.server === config.name)));
  }, [connected, config.name]);
  return (
    <div className="settings-group">
      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ flex: 1 }}>{config.name}</strong>
          <span className={`badge${connected ? " ok" : " warn"}`}>{connected ? "connected" : "offline"}</span>
        </div>
        {connected && tools.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tools.map((t) => {
              const disabled = (config.disabledTools || []).includes(t.name);
              return (
                <button
                  key={t.name}
                  className="chip-btn"
                  title={t.description}
                  style={disabled ? { opacity: 0.5 } : { borderColor: "rgba(63,162,102,0.5)" }}
                  onClick={async () => {
                    await window.emberling.mcpMarketplace.setToolEnabled({ server: config.name, tool: t.name, enabled: disabled });
                    onDone();
                  }}
                >
                  {disabled ? "⃠ " : "✓ "}
                  {t.name.replace(`mcp_${config.name}_`, "")}
                </button>
              );
            })}
          </div>
        )}
        <textarea
          className="text-input"
          style={{ width: "100%", minHeight: 50, resize: "vertical", fontSize: 12 }}
          placeholder="Custom instructions for the agent on how to use this server (optional)"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={async () => {
              await window.emberling.mcpMarketplace.setInstructions({ name: config.name, instructions });
              toast("Instructions saved");
            }}
          >
            Save instructions
          </button>
          <button
            className="btn"
            onClick={async () => {
              const res = await window.emberling.mcpMarketplace.restart(config.name);
              toast(res.ok ? `${config.name} restarted` : res.error || "restart failed");
              onDone();
            }}
          >
            ↻ Restart
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Block B11: Plugins ---------------- */
function PluginsSection() {
  const { toast } = useApp();
  const [plugins, setPlugins] = useState<any[]>([]);

  const refresh = async () => setPlugins((await window.emberling.plugins.list()) || []);
  React.useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <h2>Plugins</h2>
      <div className="screen-sub">
        Capability plugins inject keyless agent tools. Built-ins run on free public endpoints; install more from manifest JSON files (fetch-based tools only, args are validated).
      </div>
      <div style={{ marginBottom: 14 }}>
        <button
          className="btn"
          onClick={async () => {
            const res = await window.emberling.plugins.installFile();
            if (res.ok) {
              toast(`Plugin installed — tools: ${(res as any).tools?.join(", ")}`);
              refresh();
            } else if (res.error !== "cancelled") toast(res.error || "install failed");
          }}
        >
          ⬆ Install from manifest…
        </button>
      </div>
      <div className="settings-group">
        {plugins.length === 0 && <div className="list-item" style={{ color: "var(--cursor-text-quaternary)" }}>No plugins.</div>}
        {plugins.map((p) => (
          <div className="list-item" key={p.id}>
            <button className={`toggle${p.enabled ? " on" : ""}`} onClick={async () => { await window.emberling.plugins.toggle({ id: p.id, enabled: !p.enabled }); refresh(); }} />
            <div className="li-body">
              <div className="li-title">
                {p.name} {p.builtin && <span className="badge neutral">built-in</span>}
                {!p.builtin && <span className="badge neutral">installed</span>}
              </div>
              <div className="li-sub">
                {p.description} · tools: {(p.tools || []).map((t: any) => t.name).join(", ")}
              </div>
            </div>
            {!p.builtin && (
              <button className="icon-btn" onClick={async () => { await window.emberling.plugins.uninstall(p.id); refresh(); }}>
                🗑
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- Usage ---------------- */
// Emberling Plus: offline HMAC-signed license keys (the clone itself is free;
// a key just activates the Plus tier — the original's payments surface).
function PlusPlanControl() {
  const { settings, setSettings, toast } = useApp();
  const [key, setKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [holder, setHolder] = useState<string>("");

  React.useEffect(() => {
    window.emberling.integrations.licenseStatus().then((s) => {
      if (s?.holder) setHolder(s.holder);
    });
  }, []);

  if (settings.plus) {
    return <span className="badge ok">Emberling Plus{holder ? ` — ${holder}` : ""} · everything unlocked</span>;
  }
  return (
    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="text-input" style={{ width: 260 }} placeholder="License key (PLUS-…)" value={key} onChange={(e) => setKey(e.target.value)} />
      <button
        className="btn primary"
        disabled={checking || !key.trim()}
        onClick={async () => {
          setChecking(true);
          const res = await window.emberling.integrations.licenseActivate(key.trim());
          setChecking(false);
          if (res.ok) {
            setSettings((s) => ({ ...s, plus: true, plusKeyHolder: res.name || "supporter" }));
            setHolder(res.name || "supporter");
            setKey("");
            toast(`Emberling Plus activated — thanks ${res.name || "supporter"}!`);
          } else toast(res.error || "invalid key");
        }}
      >
        {checking ? "Checking…" : "Activate"}
      </button>
      <span style={{ fontSize: 11, color: "var(--cursor-text-quaternary)", maxWidth: 180 }}>
        The app is fully free — keys only unlock the Plus badge.
      </span>
    </span>
  );
}

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
          <PlusPlanControl />
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
