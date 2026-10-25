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
import { Orby, AgentDots } from "./Brand";

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

function ToolLine({ tool }: { tool: ToolRecord }) {
  const args = tool.args as Record<string, unknown> | undefined;
  const argPreview =
    args && typeof args === "object"
      ? Object.values(args)
          .filter((v) => typeof v === "string")
          .join(" ")
          .slice(0, 90) || Object.keys(args).join(", ")
      : "";
  const ok = tool.status === "ok";
  const err = tool.status === "error";
  const detail = tool.result != null ? JSON.stringify(tool.result, null, 2).slice(0, 2400) : "";
  return (
    <details className="tool-line">
      <summary>
        {toolIcon(tool.name)}
        <span className="tool-name">{tool.name}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{argPreview}</span>
        {tool.status === "running" && <span style={{ color: "var(--cursor-text-tertiary)" }}>…</span>}
        {ok && <span className="tool-status-ok">✓</span>}
        {err && <span className="tool-status-err">✕</span>}
        <IconChevronRight size={12} />
      </summary>
      {detail && <pre>{detail}</pre>}
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

export function MessageBubble({ msg, bubbleColor, onReact, onRetry, onEdit }: { msg: Message; bubbleColor: string; onReact: (emoji: string) => void; onRetry: () => void; onEdit?: () => void }) {
  const [reactOpen, setReactOpen] = useState(false);
  const fill = BUBBLE_COLORS.find((c) => c.id === bubbleColor)?.css || "var(--sand-fill-bubble-user)";
  return (
    <>
      {msg.tools?.map((t) => <ToolLine key={t.id} tool={t} />)}
      {msg.approval && <ApprovalCard msg={msg} approval={msg.approval} onResolve={msg.onApprovalResolved || (() => {})} />}
      {msg.form && <FormCard msg={msg} />}
      <div className={`msg-row ${msg.role}`}>
        <div
          className={`bubble ${msg.role}${msg.pending ? " pending" : ""}${msg.error ? " error" : ""}`}
          style={msg.role === "user" ? ({ "--bubble-user-fill": fill } as React.CSSProperties) : undefined}
        >
          {msg.voice ? <VoiceView msg={msg} /> : null}
          {msg.attachments?.map((a) => (
            <AttachmentView key={a.id} att={a} />
          ))}
          {msg.content ? (
            <>
              <Markdown content={msg.content} />
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
          {msg.reactions?.length ? (
            <div className="reactions">
              {msg.reactions.map((r) => (
                <button key={r.emoji} className={`reaction-chip${r.mine ? " mine" : ""}`} onClick={() => onReact(r.emoji)}>
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
                      onReact(e);
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
            <button className="icon-btn" title="Ask Emberling to try again" onClick={onRetry}>
              <IconRefresh size={14} />
            </button>
          )}
          {msg.role === "user" && !msg.pending && onEdit && (
            <button className="icon-btn" title="Edit message" onClick={onEdit}>
              ✎
            </button>
          )}
        </div>
      </div>
      {msg.status && msg.pending && (
        <div className="status-pill" style={{ alignSelf: "flex-start", marginLeft: 4 }}>
          <AgentDots size={16} />
          {msg.status}
        </div>
      )}
    </>
  );
}

export function ChatView({ conversation, onSendRetry }: { conversation: Conversation | null; onSendRetry: (msgIndex: number) => void }) {
  const { settings, bots, toast } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetings = useMemo(() => GREETINGS[Math.floor(rand() * GREETINGS.length)], []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation?.messages]);

  if (!conversation || conversation.messages.length === 0) {
    return (
      <div className="empty-state" ref={scrollRef}>
        <div style={{ filter: "drop-shadow(0 0 26px rgba(245, 78, 0, 0.28))" }}>
          <Orby size={104} mood="idle" />
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
        <MessageBubble
          key={m.id}
          msg={m}
          bubbleColor={settings.bubbleColor}
          onReact={(emoji) => {
            // handled by parent through a custom event to keep props light
            window.dispatchEvent(new CustomEvent("emberling:react", { detail: { messageId: m.id, emoji } }));
          }}
          onRetry={() => onSendRetry(i)}
          onEdit={() => window.dispatchEvent(new CustomEvent("emberling:edit", { detail: { messageId: m.id } }))}
        />
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
