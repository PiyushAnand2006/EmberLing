import React, { useEffect, useState } from "react";
import { useApp } from "../state";
import { DotlingFace } from "../components/Brand";
import { IconCheck } from "../components/Icons";

// Section-A integrations — REAL connections: the agent gets tools against
// each service once configured here. Tokens are stored DPAPI-encrypted
// (device-bound) in the local integrations store.
type IntegStore = Record<string, any> & { connected?: Record<string, boolean> };

export function IntegrationsScreen() {
  return (
    <div className="screen">
      <div className="screen-content" style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <DotlingFace face="scout" size={60} />
          <h2 style={{ margin: 0 }}>Integrations</h2>
        </div>
        <div className="screen-sub">
          Real connections — each one adds working tools to the agent. Tokens are encrypted with Windows DPAPI (bound to this device and account).
        </div>

        <div className="integ-grid">
          <RepoCard id="github" name="GitHub" icon="🐙" desc="Personal access token (repo scope). Adds: list repos, read/write files, issues, pull requests, comments." keyHint="https://github.com/settings/tokens" />
          <RepoCard id="gitlab" name="GitLab" icon="🦊" desc="Personal access token (api scope). Adds: list projects, read files, issues." keyHint="https://gitlab.com/-/user_settings/personal_access_tokens" />
          <RepoCard id="bitbucket" name="Bitbucket" icon="🪣" desc="App password as 'email:password'. Adds: list repositories, read files." keyHint="https://bitbucket.org/account/settings/app-passwords/" />
          <RepoCard id="azure" name="Azure DevOps" icon="🔵" desc="PAT + organization. Adds: list projects, read repo files." keyHint="https://dev.azure.com → User settings → Personal access tokens" orgField />

          <SlackCard />
          <TeamsCard />
          <EmailCard />
          <OnePasswordCard />
          <IMessageCard />
          <RemoteCard wide />
        </div>

        <div style={{ fontSize: 12, color: "var(--cursor-text-quaternary)", marginTop: 14 }}>
          Linear, Zoom and Google connectors in the original require their vendor OAuth backends; their flows are represented as connect state and the agent can still reach public services through its web tools.
        </div>
      </div>
    </div>
  );
}

function useInteg(id: string): [any, (patch: any) => void] {
  const { integrations, setIntegrations } = useApp();
  const value = (integrations as any)?.[id] || {};
  const set = (patch: any) => setIntegrations(((s: any) => ({ ...(s || {}), [id]: { ...(s || {})[id], ...patch } })) as any);
  return [value, set];
}

function CardShell({ icon, name, desc, connected, children, keyHint, wide }: { icon: string; name: string; desc: string; connected?: boolean; children?: React.ReactNode; keyHint?: string; wide?: boolean }) {
  return (
    <div className={`integ-card${connected ? " connected" : ""}`} style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <div className="integ-head">
        <span className="integ-tile">{icon}</span>
        <strong>{name}</strong>
        <span className={`badge ${connected ? "ok" : "neutral"}`}>{connected ? "Connected" : "Not connected"}</span>
      </div>
      <div className="integ-desc">{desc}</div>
      {keyHint && (
        <div style={{ fontSize: 12 }}>
          Get one free:{" "}
          <a href={keyHint} target="_blank" rel="noreferrer" style={{ color: "var(--cursor-blue)" }}>
            {keyHint.replace(/^https?:\/\//, "")}
          </a>
        </div>
      )}
      {children && <div className="integ-body">{children}</div>}
    </div>
  );
}

function RepoCard({ id, name, icon, desc, keyHint, orgField }: { id: string; name: string; icon: string; desc: string; keyHint: string; orgField?: boolean }) {  const { toast } = useApp();
  const [cfg, set] = useInteg(id);
  const [token, setToken] = useState(cfg.apiToken || "");
  const [org, setOrg] = useState(cfg.org || "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const connected = !!cfg.apiToken;

  const saveAndTest = async () => {
    setTesting(true);
    setResult(null);
    const res = await window.emberling.integrations.reposTest({ provider: id, token: token.trim(), org: org.trim() });
    setTesting(false);
    if (res.ok) {
      set({ apiToken: token.trim(), org: org.trim(), connected: true });
      const names = (res.repos || []).map((r: any) => r.full_name || r.name).slice(0, 3).join(", ");
      setResult({ ok: true, msg: `Connected — e.g. ${names}${(res.repos || []).length > 3 ? "…" : ""}` });
      toast(`${name} connected — repo tools are live`);
    } else {
      setResult({ ok: false, msg: res.error || "failed" });
    }
  };

  return (
    <CardShell icon={icon} name={name} desc={desc} connected={connected} keyHint={keyHint}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="text-input" style={{ flex: 1, minWidth: 180 }} type="password" placeholder="API token" value={token} onChange={(e) => setToken(e.target.value)} />
        {orgField && <input className="text-input" style={{ width: 130 }} placeholder="Organization" value={org} onChange={(e) => setOrg(e.target.value)} />}
        <button className="btn primary" onClick={saveAndTest} disabled={testing || !token.trim()}>
          {testing ? "Testing…" : connected ? "Reconnect" : "Connect"}
        </button>
      </div>
      {result && <div style={{ fontSize: 12, color: result.ok ? "var(--cursor-green)" : "var(--cursor-danger)", wordBreak: "break-all" }}>{result.msg}</div>}
    </CardShell>
  );
}

function SlackCard() {
  const { toast } = useApp();
  const [cfg, set] = useInteg("slack");
  const [token, setToken] = useState(cfg.botToken || "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const connected = !!cfg.botToken;

  const saveAndTest = async () => {
    setTesting(true);
    setResult(null);
    const res = await window.emberling.integrations.slackTest(token.trim());
    setTesting(false);
    if (res.ok) {
      set({ botToken: token.trim(), connected: true });
      setResult({ ok: true, msg: `Connected as ${res.user || "?"} on ${res.team || "?"}` });
      toast("Slack connected — messaging tools are live");
    } else setResult({ ok: false, msg: res.error || "failed" });
  };

  return (
    <CardShell icon="💬" name="Slack" desc="Bot token (xoxb-…) from a free Slack app with chat:write, reactions:write, channels:history, search:read. Adds: channels, send, react, history, search." connected={connected} keyHint="https://api.slack.com/apps">
      <div style={{ display: "flex", gap: 8 }}>
        <input className="text-input" style={{ flex: 1 }} type="password" placeholder="xoxb-…" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="btn primary" onClick={saveAndTest} disabled={testing || !token.trim()}>
          {testing ? "Testing…" : connected ? "Reconnect" : "Connect"}
        </button>
      </div>
      {result && <div style={{ fontSize: 12, color: result.ok ? "var(--cursor-green)" : "var(--cursor-danger)", wordBreak: "break-all" }}>{result.msg}</div>}
    </CardShell>
  );
}

function TeamsCard() {
  const { toast } = useApp();
  const [cfg, set] = useInteg("teams");
  const [pending, setPending] = useState<{ deviceCode: string; userCode: string; verifyUrl: string } | null>(null);
  const [me, setMe] = useState<{ name?: string; mail?: string } | null>(cfg.connected ? { name: cfg.accountName } : null);
  const [error, setError] = useState("");

  const signIn = async () => {
    setError("");
    const start = await window.emberling.integrations.teamsStartDeviceCode();
    if (!start?.deviceCode) {
      setError(start?.error || "could not start device sign-in");
      return;
    }
    let current = { deviceCode: start.deviceCode, userCode: start.userCode || "?", verifyUrl: start.verifyUrl || "https://microsoft.com/devicelogin" };
    setPending(current);
    const poll = async () => {
      for (let i = 0; i < 60; i++) {
        const res = await window.emberling.integrations.teamsPollToken(current.deviceCode || "");
        if (res.ok) {
          const m = await window.emberling.integrations.teamsMe();
          set({ connected: true, accountName: m?.name || "" });
          setMe(m);
          setPending(null);
          toast("Microsoft Teams connected — chat tools are live");
          return;
        }
        // Microsoft refused the permissions for this client: a fresh code for
        // the next first-party client arrives automatically — just re-enter it
        if (res.restart?.deviceCode) {
          current = { deviceCode: res.restart.deviceCode, userCode: res.restart.userCode || "?", verifyUrl: res.restart.verifyUrl || "https://microsoft.com/devicelogin" };
          setPending(current);
          setError("");
          continue;
        }
        if (!res.pending) {
          setError(res.error || "sign-in failed");
          setPending(null);
          return;
        }
      }
      setError("timed out — try again");
      setPending(null);
    };
    poll();
  };

  return (
    <CardShell icon="👥" name="Microsoft Teams" desc="Sign in with your Microsoft work/school account (device code — no admin script needed). Adds: list chats, send messages, read history via Microsoft Graph." connected={!!cfg.connected}>
      {me ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <IconCheck size={14} /> Signed in as <b>{me.name}</b> {me.mail ? `(${me.mail})` : ""}
          <button className="btn subtle" onClick={() => { set({ connected: false, accessToken: "" }); setMe(null); }}>
            Sign out
          </button>
        </div>
      ) : pending ? (
        <div style={{ fontSize: 13 }}>
          Go to{" "}
          <a href={pending.verifyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--cursor-blue)" }}>
            {pending.verifyUrl}
          </a>{" "}
          and enter code <b style={{ fontFamily: "var(--cursor-font-family-mono)", fontSize: 16 }}>{pending.userCode}</b> — waiting for you to finish…
        </div>
      ) : (
        <button className="btn primary" onClick={signIn}>
          Sign in with Microsoft
        </button>
      )}
      {error && <div style={{ fontSize: 12, color: "var(--cursor-danger)" }}>{error}</div>}
    </CardShell>
  );
}

function EmailCard() {
  const { toast } = useApp();
  const [cfg, set] = useInteg("email");
  const [form, setForm] = useState({ smtpHost: cfg.smtpHost || "", smtpPort: cfg.smtpPort || 587, imapHost: cfg.imapHost || "", imapPort: cfg.imapPort || 993, user: cfg.user || "", password: "" });
  const [saving, setSaving] = useState(false);
  const connected = !!cfg.user && !!cfg.smtpHost;

  const save = async () => {
    setSaving(true);
    const patch: any = {
      smtpHost: form.smtpHost.trim(), smtpPort: Number(form.smtpPort) || 587, smtpSecure: Number(form.smtpPort) === 465,
      imapHost: form.imapHost.trim(), imapPort: Number(form.imapPort) || 993, user: form.user.trim(),
      connected: true,
    };
    if (form.password.trim()) patch.password = form.password.trim();
    set(patch);
    setSaving(false);
    toast("Email integration saved — email_send / email_search / email_read are live");
  };

  return (
    <CardShell icon="✉️" name="Email (SMTP + IMAP)" desc="Works with Gmail/Outlook/Fastmail app passwords. Adds: email_send, email_search, email_read. Presets: Gmail = smtp.gmail.com:587 + imap.gmail.com:993." connected={connected}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="text-input" style={{ flex: "1 1 0", minWidth: 120 }} placeholder="SMTP host" value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />
          <input className="text-input" style={{ width: 70, flex: "none" }} placeholder="Port" value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: e.target.value })} />
          <input className="text-input" style={{ flex: "1 1 0", minWidth: 120 }} placeholder="IMAP host" value={form.imapHost} onChange={(e) => setForm({ ...form, imapHost: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="text-input" style={{ flex: "1 1 0", minWidth: 140 }} placeholder="Email address" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
          <input className="text-input" style={{ flex: "1 1 0", minWidth: 140 }} type="password" placeholder={cfg.passwordSet || cfg.password ? "App password saved — replace?" : "App password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <button className="btn primary" onClick={save} disabled={saving || !form.user.trim() || !form.smtpHost.trim()}>
            {saving ? "Saving…" : connected ? "Update" : "Connect"}
          </button>
        </div>
      </div>
    </CardShell>
  );
}

function OnePasswordCard() {
  const [status, setStatus] = useState<{ available?: boolean; version?: string; error?: string } | null>(null);
  useEffect(() => {
    window.emberling.integrations.opStatus().then(setStatus);
  }, []);
  return (
    <CardShell icon="🔑" name="1Password" desc="Uses the official 1Password CLI (op). Adds: op_items, op_read — the agent can read secrets you explicitly point it at, never the whole vault." connected={status?.available}>
      <div style={{ fontSize: 12, color: status?.available ? "var(--cursor-green)" : "var(--cursor-text-tertiary)" }}>
        {status?.available ? `op CLI detected (v${status.version}) — sign in once with \`op account add\`, then the tools work.` : status?.error || "Checking for the op CLI… Install: https://developer.1password.com/docs/cli/get-started"}
      </div>
    </CardShell>
  );
}

function IMessageCard() {
  const [platform, setPlatform] = useState<{ isMac?: boolean; platform?: string } | null>(null);
  useEffect(() => {
    window.emberling.integrations.imessagePlatform().then(setPlatform);
  }, []);
  return (
    <CardShell icon="🍎" name="iMessage" desc="Real AppleScript integration against the Messages app." connected={platform?.isMac}>
      <div style={{ fontSize: 12, color: platform?.isMac ? "var(--cursor-green)" : "var(--cursor-text-tertiary)" }}>
        {platform?.isMac
          ? "macOS detected — imessage_send and imessage_recent are live."
          : `Available on macOS builds (the original ships a macOS app too). This Windows build exposes the tools but they return a clear platform message.`}
      </div>
    </CardShell>
  );
}

function RemoteCard({ wide }: { wide?: boolean }) {
  const { settings, setSettings, toast } = useApp();
  const [cfg, setCfg] = useState<any>((settings as any).remote || { name: "default", host: "", port: 22, user: "" });
  const [keyInfo, setKeyInfo] = useState<{ publicKey?: string; privateKeyPath?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const target = (settings as any).executionTarget === "remote";

  const save = () => {
    setSettings((s: any) => ({ ...s, remote: cfg }));
    toast("Remote computer saved");
  };

  const genKey = async () => {
    const res = await window.emberling.integrations.remoteGenerateKey(cfg.name || "default");
    if (res?.publicKey) {
      setKeyInfo(res);
      toast("SSH keypair generated");
    } else toast(res?.error || "ssh-keygen unavailable");
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    save();
    const res = await window.emberling.integrations.remoteTest(cfg);
    setTesting(false);
    setResult({ ok: res.ok, msg: res.detail || res.error || (res.ok ? "connected" : "failed") });
  };

  return (
    <CardShell icon="🖥️" name="Remote computer — “On its computer”" desc="Run the agent's shell/file tools on another machine over SSH (any VM or PC with OpenSSH). Generate the key, append the public key to the remote's authorized_keys, then flip the execution target." wide={wide}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="text-input" style={{ width: 130 }} placeholder="Profile name" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} />
        <input className="text-input" style={{ flex: 1, minWidth: 150 }} placeholder="Host / IP" value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} />
        <input className="text-input" style={{ width: 80 }} placeholder="Port" value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: e.target.value })} />
        <input className="text-input" style={{ width: 130 }} placeholder="User" value={cfg.user} onChange={(e) => setCfg({ ...cfg, user: e.target.value })} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={genKey}>Generate SSH key</button>
        <button className="btn" onClick={save}>Save</button>
        <button className="btn primary" onClick={test} disabled={testing || !cfg.host || !cfg.user}>{testing ? "Testing…" : "Test connection"}</button>
        <button
          className={`btn${target ? " primary" : ""}`}
          disabled={!cfg.host || !cfg.user}
          onClick={() => {
            setSettings((s: any) => ({ ...s, remote: cfg, executionTarget: target ? "local" : "remote" }));
            toast(target ? "Tools run locally" : "Tools run on the remote computer");
          }}
        >
          {target ? "⏹ Stop remote execution" : "▶ Execute on this remote"}
        </button>
      </div>
      {keyInfo && (
        <div style={{ fontSize: 12 }}>
          Public key (append to the remote's <code>~/.ssh/authorized_keys</code>):
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(0,0,0,0.35)", padding: 8, borderRadius: 6, fontFamily: "var(--cursor-font-family-mono)", fontSize: 11 }}>{keyInfo.publicKey}</pre>
        </div>
      )}
      {result && <div style={{ fontSize: 12, color: result.ok ? "var(--cursor-green)" : "var(--cursor-danger)", wordBreak: "break-all" }}>{result.msg}</div>}
      <div style={{ fontSize: 12, color: "var(--cursor-text-quaternary)" }}>
        While active, run_command / read_file / write_file / list_dir execute on the remote host (approval cards say so). Screenshots stay local.
      </div>
    </CardShell>
  );
}
