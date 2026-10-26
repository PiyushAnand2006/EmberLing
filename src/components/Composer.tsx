import React, { useEffect, useRef, useState } from "react";
import { useApp } from "../state";
import type { Attachment } from "../types";
import { PopoverMenu } from "./Menu";
import { RichEditor } from "./RichEditor";
import { IconPaperclip, IconMic, IconSend, IconStop, IconX, IconCheck, IconShield, IconSparkles, IconChevronDown } from "./Icons";

const APPROVAL_LABELS: Record<string, string> = {
  ask: "Ask before acting",
  askRisky: "Ask for risky actions",
  auto: "Act automatically",
};

const SLASH_COMMANDS: { cmd: string; label: string; insert: string }[] = [
  { cmd: "/image", label: "Generate a photo", insert: "Generate a photo of " },
  { cmd: "/video", label: "Generate a clip", insert: "Generate a short clip of " },
  { cmd: "/diagram", label: "Make a diagram", insert: "Draw a mermaid diagram of " },
  { cmd: "/chart", label: "Make a chart", insert: "Make a chart of " },
  { cmd: "/preview", label: "Build an HTML preview", insert: "Build an interactive HTML preview of " },
  { cmd: "/search", label: "Search the web", insert: "Search the web for " },
  { cmd: "/form", label: "Ask me with a form", insert: "Ask me these questions with a form: " },
  { cmd: "/teach", label: "Learn from my screen", insert: "__TEACH__" },
];

export interface ComposerPrefill {
  text: string;
  nonce: number;
  editMessageId?: string;
}

export function Composer({
  busy,
  onSend,
  onStop,
  prefill,
}: {
  busy: boolean;
  onSend: (text: string, attachments: Attachment[], editMessageId?: string) => void;
  onStop: () => void;
  prefill?: ComposerPrefill | null;
}) {
  const { settings, setSettings, providers, bots, conversations, activeConversationId, setConversations, toast } = useApp();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [editMessageId, setEditMessageId] = useState<string | undefined>(undefined);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const editorRef = useRef<{ chain: () => any; commands: any } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimer = useRef<number | null>(null);
  const draftTimer = useRef<number | null>(null);

  const conversation = conversations.find((c) => c.id === activeConversationId);

  // load draft when switching conversations (draft revisions persist per chat)
  useEffect(() => {
    if (!activeConversationId) {
      setText("");
      setEditMessageId(undefined);
      return;
    }
    const conv = conversations.find((c) => c.id === activeConversationId);
    setText(conv?.draft || "");
    setEditMessageId(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // debounced draft autosave
  useEffect(() => {
    if (!activeConversationId || editMessageId) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      setConversations((list) => list.map((c) => (c.id === activeConversationId ? { ...c, draft: text } : c)));
    }, 500);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [text, activeConversationId, editMessageId, setConversations]);

  useEffect(() => {
    if (prefill) {
      if (prefill.text === "__TEACH__") {
        window.dispatchEvent(new CustomEvent("emberling:teach"));
        return;
      }
      setText(prefill.text);
      setEditMessageId(prefill.editMessageId);
      editorRef.current?.commands?.focus?.("end");
    }
  }, [prefill?.nonce]);

  useEffect(() => {
    const handler = async (files: string[]) => {
      const next: Attachment[] = [];
      for (const f of files) {
        const res = await window.emberling.media.readText(f);
        if (res.ok) next.push({ id: `${f}`, name: res.name || "file", size: res.size || 0, kind: "file", text: (res.content || "").slice(0, 12000), filePath: f });
        else next.push({ id: `${f}`, name: f.split(/[\\/]/).pop() || f, size: 0, kind: "file", filePath: f });
      }
      setAttachments((a) => [...a, ...next]);
    };
    const off = window.emberling.onFilesDropped(handler);
    return off;
  }, []);

  const activeProvider = providers.find((p) => p.id === settings.activeProvider);
  const creds = settings.providers[settings.activeProvider];
  const activeModel = creds?.model || activeProvider?.models[0]?.id || "";
  const activeBot = bots.find((b) => b.id === conversation?.botId);
  const rich = editorRef;

  const applySlash = (insert: string) => {
    setSlashOpen(false);
    if (insert === "__TEACH__") {
      window.dispatchEvent(new CustomEvent("emberling:teach"));
      setText((t) => t.replace(/\/\w*$/, ""));
      return;
    }
    setText((t) => t.replace(/\/\w*$/, "") + insert);
    requestAnimationFrame(() => editorRef.current?.commands?.focus?.("end"));
  };

  const pickFiles = async () => {
    const files = await window.emberling.dialog.pickFiles();
    if (!files?.length) return;
    const next: Attachment[] = [];
    for (const f of files) {
      const res = await window.emberling.media.readText(f);
      if (res.ok) next.push({ id: f, name: res.name || "file", size: res.size || 0, kind: "file", text: (res.content || "").slice(0, 12000), filePath: f });
      else next.push({ id: f, name: f.split(/[\\/]/).pop() || f, size: 0, kind: "file", filePath: f });
    }
    setAttachments((a) => [...a, ...next]);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        const saved = await window.emberling.media.save({ name: "voice.webm", dataBase64: btoa(bin) });
        const att: Attachment = { id: saved.id, name: "Voice message", size: blob.size, kind: "voice", url: saved.url };
        window.emberling.voice
          .transcribe({ mediaId: saved.id, mimeType: "audio/webm" })
          .then((res) => {
            if (res.ok && res.text) setText((t) => (t ? `${t} ${res.text}` : (res.text as string)));
          })
          .catch(() => {});
        setAttachments((a) => [...a, att]);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecordMs(0);
      recordTimer.current = window.setInterval(() => setRecordMs((m) => m + 200), 200);
    } catch {
      toast("Microphone unavailable");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (recordTimer.current) {
      clearInterval(recordTimer.current);
      recordTimer.current = null;
    }
  };

  const send = () => {
    if (busy || (!text.trim() && !attachments.length)) return;
    onSend(text.trim(), attachments, editMessageId);
    setText("");
    setAttachments([]);
    setEditMessageId(undefined);
    if (activeConversationId) setConversations((list) => list.map((c) => (c.id === activeConversationId ? { ...c, draft: "" } : c)));
  };

  const filteredCommands = SLASH_COMMANDS.filter((c) => c.cmd.includes(slashFilter.toLowerCase()));

  return (
    <div className="composer-wrap">
      {attachments.length > 0 && (
        <div className="attachments-row" style={{ marginBottom: 8 }}>
          {attachments.map((a) => (
            <span key={a.id} className="attachment-pill">
              {a.kind === "voice" ? "🎙️" : "📄"} <span className="att-name">{a.name}</span>
              <button className="icon-btn" onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}>
                <IconX size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer">
        {editMessageId && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 0", fontSize: 12, color: "var(--cursor-accent)" }}>
            ✎ Editing message
            <button className="btn subtle" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => { setEditMessageId(undefined); setText(""); }}>
              cancel
            </button>
          </div>
        )}
        {slashOpen && filteredCommands.length > 0 && (
          <div className="menu" style={{ position: "static", marginBottom: 4, minWidth: 260 }}>
            {filteredCommands.map((c) => (
              <button key={c.cmd} className="menu-item" onClick={() => applySlash(c.insert)}>
                <span style={{ color: "var(--cursor-brand)", fontFamily: "var(--cursor-font-family-mono)", fontSize: 12 }}>{c.cmd}</span>
                <span style={{ flex: 1, color: "var(--cursor-text-tertiary)" }}>{c.label}</span>
              </button>
            ))}
          </div>
        )}
        <RichEditor
          value={text}
          onReady={(editor) => (editorRef.current = editor)}
          onChange={(md) => {
            setText(md);
            const m = md.match(/\/(\w*)$/);
            if (m && (md.slice(0, -m[0].length) === "" || /\s$/.test(md.slice(0, -m[0].length)))) {
              setSlashOpen(true);
              setSlashFilter(m[1]);
            } else setSlashOpen(false);
          }}
          placeholder={activeBot ? `Message ${activeBot.name}…` : "Ask anything"}
          onEnter={send}
          autoFocus
        />
        <div className="composer-toolbar">
          <button className="icon-btn" title="Attach files" onClick={pickFiles}>
            <IconPaperclip size={15} />
          </button>
          <span style={{ width: 1, height: 16, background: "var(--cursor-stroke-quaternary)" }} />
          <button className="icon-btn" title="Bold" onClick={() => rich.current?.chain().focus().toggleBold().run()}>
            <b style={{ fontSize: 12 }}>B</b>
          </button>
          <button className="icon-btn" title="Italic" onClick={() => rich.current?.chain().focus().toggleItalic().run()}>
            <i style={{ fontSize: 12 }}>i</i>
          </button>
          <button className="icon-btn" title="Inline code" onClick={() => rich.current?.chain().focus().toggleCode().run()}>
            <code style={{ fontSize: 11 }}>{"</>"}</code>
          </button>
          <button className="icon-btn" title="Link" onClick={() => rich.current?.chain().focus().setLink({ href: "https://" }).run()}>
            <span style={{ fontSize: 13 }}>🔗</span>
          </button>
          <button className="icon-btn" title="Bulleted list" onClick={() => rich.current?.chain().focus().toggleBulletList().run()}>
            <span style={{ fontSize: 13 }}>•—</span>
          </button>
          <button className="icon-btn" title="Numbered list" onClick={() => rich.current?.chain().focus().toggleOrderedList().run()}>
            <span style={{ fontSize: 12, fontFamily: "var(--cursor-font-family-mono)" }}>1.</span>
          </button>
          <button className="icon-btn" title="Code block" onClick={() => rich.current?.chain().focus().toggleCodeBlock().run()}>
            <span style={{ fontSize: 11, fontFamily: "var(--cursor-font-family-mono)" }}>{"{ }"}</span>
          </button>

          <PopoverMenu
            header="Model"
            trigger={(open) => (
              <button className="chip-btn" onClick={open} title="Model">
                <IconSparkles size={12} />
                <span className="chip-label">{activeModel ? activeModel.split("/").pop()!.slice(0, 22) : "Set up model"}</span>
                <IconChevronDown size={11} />
              </button>
            )}
            items={
              activeProvider
                ? [
                    ...activeProvider.models.map((m) => ({
                      label: `${m.name} — ${m.note}`,
                      modelId: m.id,
                    })),
                    // discovered models: keep the in-chat menu fast — cap the
                    // inline list and point to Settings for the full catalog
                    ...((creds?.models as string[]) || [])
                      .filter((id: string) => !activeProvider.models.some((m) => m.id === id))
                      .slice(0, 60)
                      .map((id: string) => ({ label: id, modelId: id })),
                    ...((creds?.models as string[]) || []).length > 60
                      ? [{ label: `… ${((creds?.models as string[]) || []).length - 60} more — pick in Settings → General`, modelId: "" }]
                      : [],
                  ]
                    .map((m) =>
                      m.modelId
                        ? {
                            label: m.label,
                            icon: creds?.model === m.modelId ? <IconCheck size={13} /> : <span style={{ width: 13 }} />,
                            onClick: () =>
                              setSettings((s) => ({
                                ...s,
                                providers: { ...s.providers, [s.activeProvider]: { ...(creds || {}), apiKey: creds?.apiKey || "", model: m.modelId } },
                              })),
                          }
                        : {
                            label: m.label,
                            icon: <span style={{ width: 13 }} />,
                            onClick: () => {},
                          }
                    )
                : [{ label: "Add a provider in Settings → General", onClick: () => {} }]
            }
          />

          <PopoverMenu
            header="Approval mode"
            trigger={(open) => (
              <button className="chip-btn" onClick={open} title="Approval mode">
                <IconShield size={12} />
                <span className="chip-label">{APPROVAL_LABELS[settings.approvalMode]}</span>
                <IconChevronDown size={11} />
              </button>
            )}
            items={(["ask", "askRisky", "auto"] as const).map((mode) => ({
              label: APPROVAL_LABELS[mode],
              icon: settings.approvalMode === mode ? <IconCheck size={13} /> : <span style={{ width: 13 }} />,
              onClick: () => setSettings((s) => ({ ...s, approvalMode: mode })),
            }))}
          />

          <div className="spacer" />

          <button className={`icon-btn${recording ? " active" : ""}`} title={recording ? "Stop recording" : "Record voice message"} onClick={recording ? stopRecording : startRecording}>
            <IconMic size={15} />
          </button>
          {recording && <span style={{ fontSize: 12, color: "var(--cursor-danger)" }}>{(recordMs / 1000).toFixed(1)}s</span>}

          {busy ? (
            <button className="send-btn stop" title="Stop" onClick={onStop}>
              <IconStop size={13} />
            </button>
          ) : (
            <button className="send-btn" title="Send" onClick={send} disabled={!text.trim() && !attachments.length}>
              <IconSend size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
