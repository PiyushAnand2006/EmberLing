import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp, uid } from "../state";
import type { Conversation, Message, ToolRecord, Attachment } from "../types";
import { GREETINGS, SUGGESTIONS, BUBBLE_COLORS } from "../types";
import { Markdown } from "./Markdown";
import { PopoverMenu } from "./Menu";
import { AttachmentView } from "./AttachmentViewers";
import {
  IconCopy,
  IconRefresh,
  IconSmile,
  IconCheck,
  IconX,
  IconChevronRight,
  IconTerminal,
  IconFile,
  IconGlobe,
  IconImage,
  IconPlay,
} from "./Icons";
import { DotlingFace, AgentDots } from "./Brand";

const REACTION_SET = ["👍", "❤️", "😂", "😮", "🎉", "🙏"];

function rand() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 0x100000000;
}

function timeLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function toolIcon(name: string) {
  if (name === "web_search" || name === "web_fetch") return <IconGlobe size={13} />;
  if (name === "generate_photo") return <IconImage size={13} />;
  if (name === "screenshot") return <IconImage size={13} />;
  if (name === "run_command") return <IconTerminal size={13} />;
  return <IconFile size={13} />;
}

// row preview: the query/URL/command when present, otherwise a short reason —
// a failed call with no args must not render as an unexplained blank row
function toolPreview(tool: ToolRecord): string {
  const args = tool.args as Record<string, unknown> | undefined;
  const argPreview =
    args && typeof args === "object"
      ? Object.values(args)
          .filter((v) => typeof v === "string")
          .join(" ")
          .slice(0, 90) || Object.keys(args).join(", ")
      : "";
  if (argPreview) return argPreview;
  const err = tool.result && typeof tool.result === "object" ? (tool.result as Record<string, unknown>).error : undefined;
  return typeof err === "string" && err.trim() ? err.trim().slice(0, 90) : "";
}

function ToolLine({ tool }: { tool: ToolRecord }) {
  const ok = tool.status === "ok";
  const err = tool.status === "error";
  const detail = tool.result != null ? JSON.stringify(tool.result, null, 2).slice(0, 2400) : "";
  return (
    <details className="tool-line">
      <summary>
        {toolIcon(tool.name)}
        <span className="tool-name">{tool.name}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toolPreview(tool)}</span>
        {tool.status === "running" && <span style={{ color: "var(--cursor-text-tertiary)" }}>…</span>}
        {ok && <span className="tool-status-ok">✓</span>}
        {err && <span className="tool-status-err">✕</span>}
        <IconChevronRight size={12} />
      </summary>
      {detail && <pre>{detail}</pre>}
    </details>
  );
}

// A research turn can accumulate dozens of tool calls; one bordered row each
// buries the reply under a wall of ✓/✕. More than 3 calls collapse into a
// single summary card ("14 searches · 6 pages read · 2 failed") that expands
// to the full per-step list — the activity-card pattern used by the agent UIs
// this app mirrors. Small turns (one command, one lookup) stay as raw rows.
const TOOL_KIND_LABELS: Record<string, string> = { web_search: "searches", web_fetch: "pages read", run_command: "commands" };
function toolActivityIcon(names: string[]) {
  if (names.length && names.every((n) => n === "run_command")) return <IconTerminal size={13} />;
  if (names.some((n) => n === "web_search" || n === "web_fetch")) return <IconGlobe size={13} />;
  if (names.some((n) => n === "generate_photo" || n === "screenshot")) return <IconImage size={13} />;
  return <IconFile size={13} />;
}

// a flailing model re-issues identical calls — show each distinct attempt
// once with a ×N instead of stacking half a dozen identical ✕ rows
function dedupeToolRows(tools: ToolRecord[]): { tool: ToolRecord; count: number }[] {
  const out: { tool: ToolRecord; count: number }[] = [];
  const seen = new Map<string, number>();
  for (const t of tools) {
    let key: string;
    try {
      key = `${t.name}|${JSON.stringify(t.args)}|${t.status}`;
    } catch {
      key = `${t.name}|${String(t.args)}|${t.status}`;
    }
    const idx = seen.get(key);
    if (idx != null) {
      out[idx].count++;
      continue;
    }
    seen.set(key, out.length);
    out.push({ tool: t, count: 1 });
  }
  return out;
}

function ToolDupRow({ tool, count }: { tool: ToolRecord; count: number }) {
  return (
    <div className="tool-line tool-activity-dup">
      {toolIcon(tool.name)}
      <span className="tool-name">{tool.name}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toolPreview(tool)}</span>
      <span className="tool-activity-count">×{count}{tool.status === "error" ? "" : " cached"}</span>
      <span className={tool.status === "error" ? "tool-status-err" : "tool-status-ok"}>{tool.status === "error" ? "✕" : "✓"}</span>
    </div>
  );
}
function ToolActivity({ tools }: { tools: ToolRecord[] }) {
  if (tools.length <= 3) return <>{tools.map((t) => <ToolLine key={t.id} tool={t} />)}</>;
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(t.name, (counts.get(t.name) || 0) + 1);
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${n} ${TOOL_KIND_LABELS[name] || "steps"}`)
    .join(" · ");
  const failed = tools.filter((t) => t.status === "error").length;
  const anyRunning = tools.some((t) => t.status === "running");
  return (
    <details className="tool-activity">
      <summary>
        {toolActivityIcon(tools.map((t) => t.name))}
        <span className="tool-activity-title">{summary}</span>
        {anyRunning && <AgentDots size={14} />}
        {failed > 0 && <span className="tool-activity-failed">{failed} failed</span>}
        <span className="tool-activity-chevron"><IconChevronRight size={12} /></span>
      </summary>
      <div className="tool-activity-list">
        {dedupeToolRows(tools).map(({ tool, count }) =>
          count > 1 ? <ToolDupRow key={tool.id} tool={tool} count={count} /> : <ToolLine key={tool.id} tool={tool} />
        )}
      </div>
    </details>
  );
}

function ApprovalCard({ msg, approval, onResolve }: { msg: Message; approval: any; onResolve: (approved: boolean) => void }) {
  const resolved = msg.approvalResolved != null;
  return (
    <div className="approval-card">
      <div className="approval-title">
        <span style={{ color: "var(--cursor-warn)" }}>⚠</span>
        {approval.title || "Needs your approval"}
      </div>
      <pre>{approval.detail}</pre>
      {resolved ? (
        <div style={{ fontSize: 12, color: "var(--cursor-text-tertiary)" }}>
          {msg.approvalResolved ? "Approved" : "Declined"}
        </div>
      ) : (
        <div className="approval-actions">
          <button className="btn primary" onClick={() => onResolve(true)}>
            <IconCheck size={13} /> Approve
          </button>
          <button className="btn" onClick={() => onResolve(false)}>
            <IconX size={13} /> Decline
          </button>
        </div>
      )}
    </div>
  );
}

function FormCard({ msg }: { msg: Message }) {
  const form = msg.form!;
  const [values, setValues] = useState<Record<string, string | boolean>>(form.values || {});
  if (form.resolved) {
    return (
      <div className="approval-card" style={{ borderColor: "var(--cursor-green)" }}>
        <div className="approval-title" style={{ color: "var(--cursor-green)" }}>
          ✓ {form.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--cursor-text-tertiary)" }}>
          {Object.entries(form.values || {})
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ") || "(no values)"}
        </div>
      </div>
    );
  }
  return (
    <div className="approval-card" style={{ borderColor: "var(--cursor-accent)" }}>
      <div className="approval-title" style={{ color: "var(--cursor-accent)" }}>
        📝 {form.title}
      </div>
      {form.fields.map((f, i) => (
        <div key={i} style={{ margin: "8px 0" }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{f.label}</div>
          {f.type === "select" ? (
            <select className="text-input" style={{ width: "100%" }} value={String(values[f.label] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [f.label]: e.target.value }))}>
              <option value="">Choose…</option>
              {(f.options || []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.type === "checkbox" ? (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={!!values[f.label]} onChange={(e) => setValues((v) => ({ ...v, [f.label]: e.target.checked }))} />
              {f.placeholder || "Yes"}
            </label>
          ) : (
            <input
              className="text-input"
              style={{ width: "100%" }}
              placeholder={f.placeholder || ""}
              value={String(values[f.label] ?? "")}
              onChange={(e) => setValues((v) => ({ ...v, [f.label]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <div className="approval-actions">
        <button
          className="btn primary"
          onClick={() => {
            window.emberling.forms.resolve(form.id, values, true);
            window.dispatchEvent(new CustomEvent("emberling:form-resolved", { detail: { formId: form.id, values } }));
          }}
        >
          Submit
        </button>
        <button
          className="btn"
          onClick={() => {
            window.emberling.forms.resolve(form.id, {}, false);
            window.dispatchEvent(new CustomEvent("emberling:form-resolved", { detail: { formId: form.id, values: {} } }));
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function VoiceView({ msg }: { msg: Message }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const bars = useMemo(() => Array.from({ length: 28 }, () => 0.25 + rand() * 0.75), []);
  return (
    <div className="voice-bubble">
      <button
        className="icon-btn"
        onClick={() => {
          const a = audioRef.current;
          if (!a) return;
          if (a.paused) {
            a.play();
            setPlaying(true);
          } else {
            a.pause();
            setPlaying(false);
          }
        }}
      >
        <IconPlay size={15} />
      </button>
      <div className="waveform">
        {bars.map((h, i) => (
          <span key={i} className="bar" style={{ height: `${h * 22}px` }} />
        ))}
      </div>
      <span style={{ fontSize: 11, opacity: 0.7 }}>{Math.ceil((msg.voice?.duration || 1) / 1000)}s</span>
      <audio ref={audioRef} src={msg.voice?.url} onEnded={() => setPlaying(false)} />
      {msg.voice?.transcript ? <span style={{ fontSize: 12, opacity: 0.85 }}>“{msg.voice.transcript.slice(0, 80)}”</span> : null}
    </div>
  );
}

// trailing throttle: streaming deltas arrive faster than the eye can read —
// re-render markdown on a ~60ms cadence instead of once per chunk
function useThrottled<T>(value: T, ms: number): T {
  const [snap, setSnap] = useState(value);
  const lastRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const tick = () => {
      lastRef.current = Date.now();
      setSnap(valueRef.current);
      timerRef.current = null;
    };
    const elapsed = Date.now() - lastRef.current;
    if (elapsed >= ms) {
      tick();
      return;
    }
    if (timerRef.current == null) timerRef.current = window.setTimeout(tick, ms - elapsed);
  }, [value, ms]);
  useEffect(() => () => { if (timerRef.current != null) window.clearTimeout(timerRef.current); }, []);
  return snap;
}

// live "how long has it been working" readout — a silent pill reads as a hung
// app; a ticking counter reads as a busy one
function ElapsedPill({ since, status }: { since?: number; status: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const secs = since ? Math.max(0, Math.round((now - since) / 1000)) : 0;
  return (
    <div className="status-pill" style={{ alignSelf: "flex-start", marginLeft: 4 }}>
      <AgentDots size={16} />
      {status}
      {secs > 2 && <span style={{ opacity: 0.6 }}> · {secs}s</span>}
    </div>
  );
}

const MessageBubble = React.memo(
  function MessageBubble({ msg, msgIndex, bubbleColor, onSendRetry }: { msg: Message; msgIndex: number; bubbleColor: string; onSendRetry: (msgIndex: number) => void }) {
    const [reactOpen, setReactOpen] = useState(false);
    const fill = BUBBLE_COLORS.find((c) => c.id === bubbleColor)?.css || "var(--sand-fill-bubble-user)";
    const streamed = useThrottled(msg.content, 60);
    const content = msg.pending ? streamed : msg.content;
    return (
      <>
        {msg.tools?.length ? <ToolActivity tools={msg.tools} /> : null}
        {msg.approval && <ApprovalCard msg={msg} approval={msg.approval} onResolve={msg.onApprovalResolved || (() => {})} />}
        {msg.form && <FormCard msg={msg} />}
        <div className={`msg-row ${msg.role}`}>
          {msg.role === "assistant" && msg.botLabel ? <div className="bot-label">{msg.botLabel}</div> : null}
          <div
            className={`bubble ${msg.role}${msg.pending ? " pending" : ""}${msg.error ? " error" : ""}`}
            style={msg.role === "user" ? ({ "--bubble-user-fill": fill } as React.CSSProperties) : undefined}
          >
            {msg.voice ? <VoiceView msg={msg} /> : null}
            {msg.attachments?.map((a) => (
              <AttachmentView key={a.id} att={a} />
            ))}
            {content ? (
              <>
                <Markdown content={content} streaming={!!msg.pending} />
                {msg.edited && <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>(edited)</div>}
              </>
            ) : msg.pending && !msg.tools?.length ? (
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
            ) : null}
            {msg.error && <div style={{ fontSize: 12, marginTop: 6 }}>{msg.error}</div>}
            {msg.servedBy?.fallback && (
              <div
                className="served-by-note"
                title={(msg.servedBy.failures || []).map((f) => `${f.providerLabel || f.providerId}: ${f.message}`).join("\n")}
                style={{ fontSize: 11, marginTop: 6, opacity: 0.75 }}
              >
                ⚠ {(msg.servedBy.failures || []).map((f) => f.providerLabel || f.providerId).join(", ")} unavailable — answered via{" "}
                {msg.servedBy.provider} · {msg.servedBy.model}
              </div>
            )}
            {msg.reactions?.length ? (
              <div className="reactions">
                {msg.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    className={`reaction-chip${r.mine ? " mine" : ""}`}
                    onClick={() => window.dispatchEvent(new CustomEvent("emberling:react", { detail: { messageId: msg.id, emoji: r.emoji } }))}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        <div className="msg-actions">
          <span style={{ position: "relative" }}>
            <button className="icon-btn" title="React" onClick={() => setReactOpen((v) => !v)}>
              <IconSmile size={14} />
            </button>
            {reactOpen && (
              <div className="menu" style={{ top: "100%", left: 0, position: "absolute", display: "flex", flexDirection: "row", padding: "4px 6px" }}>
                {REACTION_SET.map((e) => (
                  <button
                    key={e}
                    className="menu-item"
                    style={{ padding: "4px 6px", fontSize: 16 }}
                    onClick={() => {
                      setReactOpen(false);
                      window.dispatchEvent(new CustomEvent("emberling:react", { detail: { messageId: msg.id, emoji: e } }));
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </span>
          <button
            className="icon-btn"
            title="Copy"
            onClick={() => navigator.clipboard.writeText(msg.content || "").then(() => {})}
          >
            <IconCopy size={14} />
          </button>
          {msg.role === "assistant" && !msg.pending && (
            <button className="icon-btn" title="Ask Emberling to try again" onClick={() => onSendRetry(msgIndex)}>
              <IconRefresh size={14} />
            </button>
          )}
          {msg.role === "user" && !msg.pending && (
            <button
              className="icon-btn"
              title="Edit message"
              onClick={() => window.dispatchEvent(new CustomEvent("emberling:edit", { detail: { messageId: msg.id } }))}
            >
              ✎
            </button>
          )}
        </div>
      </div>
      {msg.status && msg.pending && <ElapsedPill since={msg.startedAt} status={msg.status} />}
    </>
    );
  },
  // skip re-render unless THIS message changed — sibling bubbles keep their
  // object identity through stream updates; handlers are built from
  // (msg.id, msgIndex) inside, so ignoring their identity is safe
  (prev, next) => prev.msg === next.msg && prev.bubbleColor === next.bubbleColor && prev.msgIndex === next.msgIndex
);

export function ChatView({ conversation, onSendRetry }: { conversation: Conversation | null; onSendRetry: (msgIndex: number) => void }) {
  const { settings, bots, toast } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetings = useMemo(() => GREETINGS[Math.floor(rand() * GREETINGS.length)], []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation?.messages]);

  if (!conversation || conversation.messages.length === 0) {
    // the bound Dotling fronts its own chat: JIMI shows JIMI's face, not Orby's
    const bot = bots.find((b) => b.id === conversation?.botId);
    const botFace = bot?.face || "orby";
    return (
      <div className="empty-state" ref={scrollRef}>
        <div style={{ filter: bot?.face ? "none" : "drop-shadow(0 0 26px rgba(245, 78, 0, 0.28))" }}>
          <DotlingFace face={botFace} size={130} />
        </div>
        <div className="greeting">{greetings}</div>
        <div className="sub">
          {settings.activeProvider
            ? "Ask anything — I can run commands, edit files, search the web, and generate photos on your computer."
            : "Set up a free API key in Settings → General to start chatting."}
        </div>
        <div className="suggestion-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion-chip" onClick={() => window.dispatchEvent(new CustomEvent("emberling:compose", { detail: s }))}>
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const bot = bots.find((b) => b.id === conversation.botId);
  return (
    <div className="chat-scroll" ref={scrollRef}>
      {bot && (
        <div style={{ textAlign: "center", padding: "6px 0 12px", fontSize: 12, color: "var(--cursor-text-tertiary)" }}>
          Talking to {bot.emoji} {bot.name}
        </div>
      )}
      {conversation.messages.map((m, i) => (
        <MessageBubble key={m.id} msg={m} msgIndex={i} bubbleColor={settings.bubbleColor} onSendRetry={onSendRetry} />
      ))}
      {!!conversation.queued?.length && (
        <div className="tool-line" style={{ cursor: "default" }}>
          <span className="tool-name">Queued</span>
          <span style={{ flex: 1 }}>{conversation.queued.length} message{conversation.queued.length > 1 ? "s" : ""} waiting to send</span>
          <button
            className="btn subtle"
            style={{ padding: "2px 10px", fontSize: 11 }}
            onClick={() => window.dispatchEvent(new CustomEvent("emberling:flush-queue"))}
          >
            Send now
          </button>
        </div>
      )}
    </div>
  );
}

export { timeLabel };
