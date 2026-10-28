import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useApp, uid } from "./state";
import type { Attachment, Conversation, Message } from "./types";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { BotScreenPanel } from "./components/BotScreen";
import { Composer } from "./components/Composer";
import { SettingsScreen } from "./screens/SettingsScreen";
import { BotsScreen } from "./screens/BotsScreen";
import { MemoriesScreen } from "./screens/MemoriesScreen";
import { AutomationsScreen } from "./screens/AutomationsScreen";
import { IntegrationsScreen } from "./screens/IntegrationsScreen";
import { ContactsScreen } from "./screens/ContactsScreen";
import { Onboarding } from "./screens/Onboarding";
import { PopoverMenu } from "./components/Menu";
import { IconMinimize, IconMaximize, IconX, IconBot, IconCheck, IconChevronDown } from "./components/Icons";
import { LogoMark } from "./components/Brand";

function TitleBar({ title }: { title: string }) {
  return (
    <div className="titlebar">
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: 130 }}>
        <LogoMark size={17} />
      </div>
      <div className="titlebar-title">{title}</div>
      <div className="window-controls">
        <button onClick={() => window.emberling.window.minimize()} title="Minimize">
          <IconMinimize />
        </button>
        <button onClick={() => window.emberling.window.maximize()} title="Maximize">
          <IconMaximize />
        </button>
        <button className="wc-close" onClick={() => window.emberling.window.close()} title="Close">
          <IconX size={13} />
        </button>
      </div>
    </div>
  );
}

function useAgentOrchestration() {
  const { conversations, setConversations, bots, settings, activeConversationId, setActiveConversationId, toast } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyIdRef = useRef<string | null>(null);
  busyIdRef.current = busyId;

  const patchMessage = useCallback(
    (convId: string, msgId: string, fn: (m: Message) => Message) => {
      setConversations((list) =>
        list.map((c) =>
          c.id === convId
            ? { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) }
            : c
        )
      );
    },
    [setConversations]
  );

  useEffect(() => {
    return window.emberling.agent.onEvent((evt) => {
      const { conversationId, type, payload } = evt;
      if (type === "status") {
        setConversations((list) => {
          const conv = list.find((c) => c.id === conversationId);
          const last = conv?.messages[conv.messages.length - 1];
          if (!conv || !last || last.role !== "assistant") return list;
          return list.map((c) =>
            c.id === conversationId
              ? { ...c, messages: c.messages.map((m) => (m.id === last.id ? { ...m, status: payload.text } : m)) }
              : c
          );
        });
      } else if (type === "delta") {
        setConversations((list) => {
          const conv = list.find((c) => c.id === conversationId);
          const last = conv?.messages[conv.messages.length - 1];
          if (!conv || !last || last.role !== "assistant") return list;
          return list.map((c) =>
            c.id === conversationId
              ? { ...c, messages: c.messages.map((m) => (m.id === last.id ? { ...m, content: m.content + payload.delta } : m)) }
              : c
          );
        });
      } else if (type === "toolCall") {
        setConversations((list) => {
          const conv = list.find((c) => c.id === conversationId);
          const last = conv?.messages[conv.messages.length - 1];
          if (!conv || !last || last.role !== "assistant") return list;
          const tool = { id: uid(), name: payload.call.name, args: payload.call.args, status: "running" as const };
          return list.map((c) =>
            c.id === conversationId
              ? { ...c, messages: c.messages.map((m) => (m.id === last.id ? { ...m, tools: [...(m.tools || []), tool] } : m)) }
              : c
          );
        });
      } else if (type === "toolResult") {
        setConversations((list) => {
          const conv = list.find((c) => c.id === conversationId);
          if (!conv) return list;
          return list.map((c) => {
            if (c.id !== conversationId) return c;
            const messages = [...c.messages];
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              if (m.role !== "assistant" || !m.tools?.length) continue;
              const idx = m.tools.findIndex((t) => t.name === payload.call.name && t.status === "running");
              if (idx >= 0) {
                const tools = [...m.tools];
                tools[idx] = { ...tools[idx], status: payload.result?.ok === false ? "error" : "ok", result: payload.result };
                messages[i] = { ...m, tools };
                break;
              }
            }
            return { ...c, messages };
          });
        });
      } else if (type === "approval") {
        setConversations((list) => {
          const conv = list.find((c) => c.id === conversationId);
          const last = conv?.messages[conv.messages.length - 1];
          if (!conv || !last || last.role !== "assistant") return list;
          return list.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === last.id
                      ? {
                          ...m,
                          approval: payload,
                          onApprovalResolved: (approved: boolean) => {
                            window.emberling.agent.resolveApproval(payload.id, approved);
                            patchMessage(conversationId, m.id, (mm) => ({ ...mm, approvalResolved: approved }));
                          },
                        }
                      : m
                  ),
                }
              : c
          );
        });
      } else if (type === "form") {
        setConversations((list) => {
          const conv = list.find((c) => c.id === conversationId);
          const last = conv?.messages[conv.messages.length - 1];
          if (!conv || !last || last.role !== "assistant") return list;
          return list.map((c) =>
            c.id === conversationId
              ? { ...c, messages: c.messages.map((m) => (m.id === last.id ? { ...m, form: payload } : m)) }
              : c
          );
        });
      } else if (type === "uiAction") {
        if (payload?.type === "react") {
          setConversations((list) => {
            const conv = list.find((c) => c.id === conversationId);
            if (!conv) return list;
            const idx = [...conv.messages].reverse().findIndex((m) => m.role === "user");
            if (idx < 0) return list;
            const realIdx = conv.messages.length - 1 - idx;
            return list.map((c) => {
              if (c.id !== conversationId) return c;
              const messages = [...c.messages];
              const m = messages[realIdx];
              const reactions = [...(m.reactions || [])];
              const rIdx = reactions.findIndex((r) => r.emoji === payload.emoji);
              if (rIdx >= 0) reactions[rIdx] = { ...reactions[rIdx], mine: true };
              else reactions.push({ emoji: payload.emoji, mine: true });
              messages[realIdx] = { ...m, reactions };
              return { ...c, messages };
            });
          });
        } else if (payload?.type === "memory-saved") {
          toast(`Memory saved: ${String(payload.text || "").slice(0, 60)}`);
        }
      } else if (type === "done") {
        setConversations((list) => {
          const conv = list.find((c) => c.id === conversationId);
          const last = conv?.messages[conv.messages.length - 1];
          if (!conv || !last || last.role !== "assistant") return list;
          const unreadBump = conversationId !== activeConversationIdRef.current ? 1 : 0;
          return list.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  unread: c.muted ? c.unread : (c.unread || 0) + unreadBump,
                  messages: c.messages.map((m) =>
                    m.id === last.id
                      ? {
                          ...m,
                          pending: false,
                          status: undefined,
                          error: payload.error,
                          content: m.content || payload.text || (payload.stopped ? "_Stopped._" : ""),
                        }
                      : m
                  ),
                }
              : c
          );
        });
        if (busyIdRef.current === conversationId) setBusyId(null);
      }
    });
  }, [setConversations, patchMessage]);

  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const buildHistory = useCallback((conv: Conversation): { role: string; content: string }[] => {
    return conv.messages
      .filter((m) => !m.error)
      .slice(-30)
      .map((m) => {
        let content = m.content || "";
        if (m.voice?.transcript) content = `${content}\n(voice transcript: ${m.voice.transcript})`.trim();
        for (const a of m.attachments || []) {
          if (a.text) content += `\n\n[Attached file: ${a.name}]\n${a.text}`;
          else content += `\n\n[Attached file: ${a.name}]`;
        }
        return { role: m.role, content };
      });
  }, []);

  const send = useCallback(
    async (text: string, attachments: Attachment[], opts?: { reuseConversation?: Conversation; historyOverride?: { role: string; content: string }[]; editMessageId?: string; fromQueue?: boolean }) => {
      let conv = opts?.reuseConversation || null;
      if (!conv && activeConversationIdRef.current) {
        conv = conversations.find((c) => c.id === activeConversationIdRef.current) || null;
      }
      if (!conv) {
        conv = {
          id: uid(),
          title: text.slice(0, 42) || "New chat",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          unread: 0,
          botId: "",
        };
        setConversations((list) => [conv!, ...list]);
        setActiveConversationId(conv.id);
        // let state settle so subsequent patches find the conversation
        await new Promise((r) => setTimeout(r, 30));
      }
      const convId = conv.id;
      const botId = conv.botId || "";
      const assistantMsg: Message = { id: uid(), role: "assistant", content: "", ts: Date.now(), pending: true, status: "Working" };

      if (opts?.editMessageId) {
        // message edit with revision history: replace in place, rerun from there
        const idx = conv.messages.findIndex((m) => m.id === opts.editMessageId);
        if (idx >= 0) {
          const original = conv.messages[idx];
          const edited: Message = { ...original, content: text, edited: true, revisions: [...(original.revisions || []), original.content].slice(-5) };
          const kept = conv.messages.slice(0, idx);
          setConversations((list) => list.map((c) => (c.id === convId ? { ...c, updatedAt: Date.now(), messages: [...kept, edited, assistantMsg] } : c)));
          setBusyId(convId);
          const res = await window.emberling.agent.send({ conversationId: convId, history: buildHistory({ ...conv, messages: [...kept, edited] }), botId, mode: "visible" });
          if (!res.ok) {
            patchMessage(convId, assistantMsg.id, (m) => ({ ...m, pending: false, status: undefined, error: res.error }));
            setBusyId(null);
          }
          return;
        }
      }

      const userMsg: Message = { id: uid(), role: "user", content: text, ts: Date.now(), attachments };
      setConversations((list) =>
        list.map((c) => (c.id === convId ? { ...c, updatedAt: Date.now(), messages: [...c.messages, userMsg, assistantMsg] } : c))
      );
      if (conv.title === "New chat" && text) {
        setConversations((list) => list.map((c) => (c.id === convId ? { ...c, title: text.slice(0, 42) } : c)));
      }
      setBusyId(convId);
      const history = opts?.historyOverride || buildHistory({ ...conv, messages: [...conv.messages, userMsg] });
      const res = await window.emberling.agent.send({ conversationId: convId, history, botId, mode: "visible" });
      if (!res.ok) {
        if (settingsRef.current.queueOffline && !opts?.fromQueue) {
          // offline queue: pull the failed turn back out and keep it pending
          setConversations((list) =>
            list.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: c.messages.filter((m) => m.id !== userMsg.id && m.id !== assistantMsg.id),
                    queued: [...(c.queued || []), { id: uid(), text, attachments, ts: Date.now() }],
                  }
                : c
            )
          );
          setBusyId(null);
          toast("Provider unavailable — message queued");
          return;
        }
        patchMessage(convId, assistantMsg.id, (m) => ({ ...m, pending: false, status: undefined, error: res.error }));
        setBusyId(null);
        toast("Turn failed — check provider settings");
      }
    },
    [conversations, setConversations, setActiveConversationId, buildHistory, patchMessage, toast]
  );

  const flushQueue = useCallback(
    (convId?: string) => {
      const id = convId || activeConversationIdRef.current;
      if (!id) return;
      const conv = conversations.find((c) => c.id === id);
      const next = conv?.queued?.[0];
      if (!conv || !next) return;
      setConversations((list) => list.map((c) => (c.id === id ? { ...c, queued: (c.queued || []).slice(1) } : c)));
      send(next.text, next.attachments, { reuseConversation: { ...conv, queued: [] }, fromQueue: true });
    },
    [conversations, setConversations, send]
  );

  const retry = useCallback(
    (msgIndex: number) => {
      const conv = conversations.find((c) => c.id === activeConversationIdRef.current);
      if (!conv) return;
      const target = conv.messages[msgIndex];
      if (!target || target.role !== "assistant") return;
      // find the preceding user message
      let userIdx = msgIndex - 1;
      while (userIdx >= 0 && conv.messages[userIdx].role !== "user") userIdx--;
      if (userIdx < 0) return;
      const userMsg = conv.messages[userIdx];
      const truncated: Conversation = { ...conv, messages: conv.messages.slice(0, userIdx) };
      setConversations((list) => list.map((c) => (c.id === conv.id ? { ...c, messages: truncated.messages } : c)));
      send(userMsg.content, userMsg.attachments || [], {
        reuseConversation: { ...truncated, messages: [...truncated.messages, userMsg] },
        historyOverride: buildHistory({ ...truncated, messages: [...truncated.messages, userMsg] }),
      });
    },
    [conversations, setConversations, send, buildHistory]
  );

  const react = useCallback(
    (messageId: string, emoji: string) => {
      const convId = activeConversationIdRef.current;
      if (!convId) return;
      patchMessage(convId, messageId, (m) => {
        const reactions = [...(m.reactions || [])];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx >= 0 && reactions[idx].mine) reactions.splice(idx, 1);
        else if (idx >= 0) reactions[idx] = { ...reactions[idx], mine: true };
        else reactions.push({ emoji, mine: true });
        return { ...m, reactions };
      });
    },
    [patchMessage]
  );

  return { busyId, busy: busyId != null && busyId === activeConversationId, send, retry, react, flushQueue };
}

const AgentCtx = React.createContext<ReturnType<typeof useAgentOrchestration> | null>(null);
function useAgent() {
  const v = React.useContext(AgentCtx);
  if (!v) throw new Error("no agent context");
  return v;
}

function ChatScreen() {
  const app = useApp();
  const { conversations, activeConversationId, bots, settings, toast } = app;
  const { busy, send, retry, react, flushQueue } = useAgent();
  const [prefill, setPrefill] = useState<{ text: string; nonce: number; editMessageId?: string } | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const teachRef = useRef<{ id: string } | null>(null);
  const voiceModeRef = useRef(false);
  voiceModeRef.current = voiceMode;

  // speak the agent reply out loud when in voice mode
  useEffect(() => {
    if (!voiceMode) return;
    const off = window.emberling.agent.onEvent((evt) => {
      if (evt.type !== "done" || !evt.payload?.text) return;
      if (!voiceModeRef.current) return;
      setVoiceBusy("speaking");
      const clean = String(evt.payload.text).replace(/[#*`>\[\]()]/g, "").slice(0, 600);
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = settings.voice?.rate || 1;
      u.onend = () => setVoiceBusy("idle");
      speechSynthesis.speak(u);
    });
    return off;
  }, [voiceMode, settings.voice?.rate]);

  // live streaming STT via the Web Speech API (the original's StreamStt):
  // keyless, interim results, no recording round-trip. Falls back to the
  // recorded-memo + Whisper path when the browser API is unavailable.
  const listenOnce = useCallback(async () => {
    if (!voiceModeRef.current) return;
    setVoiceBusy("listening");
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const ok = await new Promise<boolean>((resolve) => {
        try {
          const rec = new SR();
          rec.continuous = false;
          rec.interimResults = true;
          rec.lang = navigator.language || "en-US";
          let finalText = "";
          rec.onresult = (e: any) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            }
          };
          rec.onerror = () => resolve(false);
          rec.onend = () => {
            const text = String(finalText).trim();
            if (text) {
              setVoiceBusy("thinking");
              send(text, []);
            } else {
              setVoiceBusy("idle");
            }
            resolve(true);
          };
          rec.start();
          window.dispatchEvent(new CustomEvent("emberling:voice-recorder", { detail: { stop: () => { try { rec.stop(); } catch {} } } }));
        } catch {
          resolve(false);
        }
      });
      if (ok) return;
      setVoiceBusy("listening");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const saved = await window.emberling.media.save({ name: "voice.webm", dataBase64: btoa(bin) });
        const res = await window.emberling.voice.transcribe({ mediaId: saved.id, mimeType: "audio/webm" });
        if (res.ok && res.text) {
          setVoiceBusy("thinking");
          send(String(res.text), []);
        } else {
          setVoiceBusy("idle");
          toast(res.error || "Transcription needs a free Groq key (Settings → General)");
        }
      };
      rec.start();
      // hands-free: auto-stop after ~1.2 s of silence (min 1 s, hard cap 30 s).
      // This is what makes voice mode feel like a call rather than a memo.
      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let stopped = false;
      let spoke = false;
      let quietSince = 0;
      const tick = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        if (peak > 12) {
          spoke = true;
          quietSince = 0;
        } else if (spoke) {
          quietSince += 100;
        }
        if ((spoke && quietSince >= 1200) || rec.state === "inactive") {
          stopped = true;
          audioCtx.close().catch(() => {});
          if (rec.state !== "inactive") rec.stop();
          return;
        }
        setTimeout(tick, 100);
      };
      setTimeout(tick, 900);
      setTimeout(() => {
        if (!stopped) {
          stopped = true;
          audioCtx.close().catch(() => {});
          if (rec.state !== "inactive") rec.stop();
        }
      }, 30000);
      const stop = () => {
        if (rec.state !== "inactive") rec.stop();
      };
      (rec as any)._stop = stop;
      window.dispatchEvent(new CustomEvent("emberling:voice-recorder", { detail: { stop } }));
    } catch {
      setVoiceBusy("idle");
      toast("Microphone unavailable");
    }
  }, [send, toast]);

  useEffect(() => {
    const onCompose = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      setPrefill({ text: detail, nonce: Date.now() });
    };
    const onReact = (e: Event) => {
      const detail = (e as CustomEvent).detail as { messageId: string; emoji: string };
      react(detail.messageId, detail.emoji);
    };
    const onEdit = (e: Event) => {
      const detail = (e as CustomEvent).detail as { messageId: string };
      const conv = conversations.find((c) => c.id === activeConversationId);
      const msg = conv?.messages.find((m) => m.id === detail.messageId);
      if (msg) setPrefill({ text: msg.content, nonce: Date.now(), editMessageId: msg.id });
    };
    const onFlush = () => flushQueue();
    const onFormResolved = (e: Event) => {
      const detail = (e as CustomEvent).detail as { formId: string; values: Record<string, unknown> };
      const convId = activeConversationId;
      if (!convId) return;
      app.setConversations((list) =>
        list.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.form && m.form.id === detail.formId ? { ...m, form: { ...m.form, resolved: true, values: detail.values as any } } : m
                ),
              }
            : c
        )
      );
    };
    const onTeach = async () => {
      if (teachRef.current) {
        const res = await window.emberling.teach.stop(teachRef.current.id);
        teachRef.current = null;
        const shots = (res.shots || []).slice(0, 10);
        if (!shots.length) {
          toast("No frames captured");
          return;
        }
        const atts = shots.map((url, i) => ({ id: url, name: `demo-step-${i + 1}.png`, size: 0, kind: "image" as const, url }));
        // Block B12/C: the demonstration is saved as a replayable skill AND
        // sent to the active chat so the agent learns it immediately.
        const skill = {
          name: `Demonstrated procedure ${new Date().toLocaleString()}`,
          instructions:
            "Replay the task shown in the attached demonstration frames, in order. Each frame is one step of the procedure the user performed on screen.",
          steps: shots.map((_, i) => `Follow demo-step-${i + 1}.png: perform the visible state transition`),
          tools: ["screen_screenshot", "screen_click", "screen_scroll", "type_text", "focus_window"],
          source: "teach",
        };
        await window.emberling.skills.upsert(skill);
        send("The recording is finished. Learn the task from it and remember it as a skill.", atts);
        toast(`Demonstration captured (${shots.length} frames) — saved as a skill`);
      } else {
        const res = await window.emberling.teach.start(4000);
        if (res.ok) {
          teachRef.current = { id: res.id };
          toast("Recording your screen — click again to finish");
        }
      }
    };
    window.addEventListener("emberling:compose", onCompose);
    window.addEventListener("emberling:react", onReact);
    window.addEventListener("emberling:edit", onEdit);
    window.addEventListener("emberling:flush-queue", onFlush);
    window.addEventListener("emberling:teach", onTeach);
    window.addEventListener("emberling:form-resolved", onFormResolved);
    return () => {
      window.removeEventListener("emberling:compose", onCompose);
      window.removeEventListener("emberling:react", onReact);
      window.removeEventListener("emberling:edit", onEdit);
      window.removeEventListener("emberling:flush-queue", onFlush);
      window.removeEventListener("emberling:teach", onTeach);
      window.removeEventListener("emberling:form-resolved", onFormResolved);
    };
  }, [react, conversations, activeConversationId, flushQueue, send, toast]);

  const conversation = conversations.find((c) => c.id === activeConversationId) || null;
  const activeBot = bots.find((b) => b.id === conversation?.botId);

  return (
    <>
      <div className="main-header">
        <PopoverMenu
          header="Chat with"
          trigger={(open) => (
            <button className="chip-btn" onClick={open}>
              <IconBot size={12} />
              <span className="chip-label">{activeBot ? `${activeBot.emoji} ${activeBot.name}` : "Emberling"}</span>
              <IconChevronDown size={11} />
            </button>
          )}
          items={[
            {
              label: "🤖 Emberling (default)",
              icon: !conversation?.botId ? <IconCheck size={13} /> : <span style={{ width: 13 }} />,
              onClick: () =>
                conversation &&
                app.setConversations((list) => list.map((c) => (c.id === conversation.id ? { ...c, botId: "" } : c))),
            },
            ...bots.map((b) => ({
              label: `${b.emoji} ${b.name}`,
              icon: conversation?.botId === b.id ? <IconCheck size={13} /> : <span style={{ width: 13 }} />,
              onClick: () =>
                conversation &&
                app.setConversations((list) =>
                  list.map((c) =>
                    c.id === conversation.id
                      ? {
                          ...c,
                          botId: b.id,
                          // an untitled chat adopts the bot's name for the sidebar
                          title: !c.messages.length && (!c.title || c.title === "New chat") ? `${b.emoji} ${b.name}` : c.title,
                        }
                      : c
                    )
                  ),
            })),
          ]}
        />
        <div className="header-title">
          {(() => {
            // the bot chip already names the bot — don't repeat it when the
            // conversation title is just the bot's name (e.g. bot-created chats)
            const raw = conversation?.title || "New chat";
            const dup = activeBot && (raw === activeBot.name || raw === `${activeBot.emoji} ${activeBot.name}` || raw.replace(/^[^\w]+/, "").trim() === activeBot.name);
            return dup ? "" : raw;
          })()}
        </div>
        <button
          className={`icon-btn${teachRef.current ? " active" : ""}`}
          title="Learn from demonstration — record your screen"
          onClick={() => window.dispatchEvent(new CustomEvent("emberling:teach"))}
        >
          🎓
        </button>
        <button
          className={`icon-btn${voiceMode ? " active" : ""}`}
          title={voiceMode ? `Voice mode (${voiceBusy}) — click to end` : "Voice mode"}
          onClick={() => {
            if (voiceMode) {
              speechSynthesis.cancel();
              setVoiceMode(false);
              setVoiceBusy("idle");
            } else {
              setVoiceMode(true);
              listenOnce();
            }
          }}
          style={voiceMode ? { color: "var(--cursor-green)" } : undefined}
        >
          📞
        </button>
      </div>
      {voiceMode && (
        <div className="status-pill" style={{ alignSelf: "center", margin: "6px auto" }}>
          <span className="status-dot" style={{ background: voiceBusy === "listening" ? "var(--cursor-danger)" : "var(--cursor-green)" }} />
          Voice mode — {voiceBusy === "idle" ? "tap the mic to talk" : voiceBusy}
          {voiceBusy === "idle" && (
            <button className="btn subtle" style={{ padding: "2px 10px" }} onClick={listenOnce}>
              🎙 Talk
            </button>
          )}
        </div>
      )}
      <div className={`chat-with-rail${conversation?.botId ? " has-rail" : ""}`}>
        <div className="chat-rail-main">
          <ChatView
            conversation={conversation}
            onSendRetry={retry}
          />
          <Composer
            busy={busy}
            prefill={prefill}
            onSend={(text, attachments, editMessageId) => send(text, attachments, { editMessageId })}
            onStop={() => conversation && window.emberling.agent.stop(conversation.id)}
          />
        </div>
        {conversation?.botId && (
          <aside className="bot-screen-rail">
            <BotScreenPanel botId={conversation.botId} botName={bots.find((b) => b.id === conversation.botId)?.name || "Bot"} />
          </aside>
        )}
      </div>
    </>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

// Auto-update banner (like the original's updater toast): download progress
// pill, then a "Restart to update" card once the new version is staged.
// Portable builds can't self-install, so they get a GitHub link instead.
function UpdateBanner() {
  const [status, setStatus] = useState<{ state: string; version?: string; percent?: number } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(
    () =>
      window.emberling.updater.onStatus((payload) => {
        setStatus(payload);
        // re-show the card if a newer update arrives after a dismissal
        if (payload.state === "ready" || payload.state === "available") setDismissed(null);
      }),
    []
  );
  if (!status || dismissed === (status.state === "downloading" ? "downloading" : status.state + (status.version || ""))) return null;
  const dismiss = () => setDismissed(status.state === "downloading" ? "downloading" : status.state + (status.version || ""));
  if (status.state === "downloading") {
    return (
      <div className="update-banner">
        <span style={{ color: "var(--cursor-text-secondary)" }}>
          Updating Emberling{status.version ? ` to ${status.version}` : ""}
          {status.percent != null && status.percent > 0 ? ` — ${status.percent}%` : "…"}
        </span>
        <button className="btn" onClick={dismiss}>
          Hide
        </button>
      </div>
    );
  }
  if (status.state === "ready") {
    return (
      <div className="update-banner">
        <span>
          <strong style={{ color: "var(--cursor-green)" }}>Emberling {status.version}</strong> is ready to install
        </span>
        <button className="btn primary" onClick={() => window.emberling.updater.install()}>
          <IconCheck size={13} /> Restart to update
        </button>
        <button className="btn" onClick={dismiss}>
          Later
        </button>
      </div>
    );
  }
  if (status.state === "available") {
    return (
      <div className="update-banner">
        <span>
          New version <strong style={{ color: "var(--cursor-accent)" }}>{status.version}</strong> available
        </span>
        <button className="btn primary" onClick={() => window.emberling.updater.openReleases()}>
          Get it from GitHub
        </button>
        <button className="btn" onClick={dismiss}>
          Later
        </button>
      </div>
    );
  }
  return null;
}

function Shell() {
  const { route, conversations, activeConversationId } = useApp();
  const agent = useAgentOrchestration();
  const conversation = conversations.find((c) => c.id === activeConversationId);
  const title =
    route.kind === "settings"
      ? "Settings"
      : route.kind === "bots"
        ? "Bots"
        : route.kind === "contacts"
          ? "Contacts"
          : route.kind === "memories"
            ? "Memories"
            : route.kind === "automations"
              ? "Automations"
              : route.kind === "integrations"
                ? "Integrations"
                : route.kind === "onboarding"
                  ? "Welcome to Emberling"
                  : conversation?.title || "Emberling";

  let content: React.ReactNode;
  switch (route.kind) {
    case "settings":
      content = <SettingsScreen />;
      break;
    case "bots":
      content = <BotsScreen />;
      break;
    case "contacts":
      content = <ContactsScreen />;
      break;
    case "memories":
      content = <MemoriesScreen />;
      break;
    case "automations":
      content = <AutomationsScreen />;
      break;
    case "integrations":
      content = <IntegrationsScreen />;
      break;
    case "onboarding":
      content = <Onboarding />;
      break;
    default:
      content = <ChatScreen />;
  }

  return (
    <AgentCtx.Provider value={agent}>
      <div className="app-shell">
        <TitleBar title={title} />
        <Sidebar />
        <div className="main-column">{content}</div>
        <Toasts />
        <UpdateBanner />
      </div>
    </AgentCtx.Provider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
