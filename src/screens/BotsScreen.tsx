import React, { useEffect, useState } from "react";
import { useApp, uid } from "../state";
import type { Bot } from "../types";
import { IconPlus, IconTrash, IconBot } from "../components/Icons";
import { DotlingFace, DOTLING_FACES } from "../components/Brand";

const EMOJIS = ["🤖", "🧠", "🛠️", "📊", "✍️", "🔬", "🎨", "💼", "🗺️", "🎧", "🌱", "⚡"];
const COLORS = ["#126fd4", "#0d9655", "#7442d1", "#d2550a", "#c82532", "#0d9381", "#c82779", "#86592e"];

// Block B12: pick which installed skills this bot follows
function SkillPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const [skills, setSkills] = useState<any[]>([]);
  useEffect(() => {
    window.emberling.skills.list().then(setSkills);
  }, []);
  if (!skills.length)
    return (
      <div style={{ fontSize: 12, color: "var(--cursor-text-quaternary)" }}>
        No skills installed yet — record one with 🎓 Learn from demonstration, or the agent can save procedures it learns.
      </div>
    );
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {skills.map((s) => (
        <button key={s.id} className={`chip-btn${selected.includes(s.id) ? " primary" : ""}`} style={selected.includes(s.id) ? { borderColor: "var(--cursor-accent)", color: "var(--cursor-text-primary)" } : undefined} onClick={() => onToggle(s.id)}>
          {selected.includes(s.id) ? "✓ " : ""}
          {s.name} {s.steps?.length ? `(${s.steps.length} steps)` : ""}
        </button>
      ))}
    </div>
  );
}

function PublishControls({ botId }: { botId: string }) {
  const { toast } = useApp();
  const [state, setState] = useState<{ url?: string; access?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    window.emberling.publish.state().then((s) => {
      if (!alive) return;
      const mine = s.bots?.find((b: any) => b.id === botId);
      if (mine) setState({ url: `http://${s.lanIp}:${s.port}/agent/${botId}`, access: mine.access });
    });
    return () => {
      alive = false;
    };
  }, [botId]);

  const publish = async () => {
    setBusy(true);
    const res = await window.emberling.publish.publish(botId);
    setBusy(false);
    if (res.ok) {
      setState({ url: res.url, access: res.access });
      toast("Bot published — share the link");
    } else toast(res.error || "Publish failed");
  };

  if (!state)
    return (
      <button className="btn primary" onClick={publish} disabled={busy}>
        {busy ? "Publishing…" : "🚀 Publish bot"}
      </button>
    );

  return (
    <div className="settings-group" style={{ marginBottom: 0 }}>
      <div className="settings-row">
        <div>
          <div className="row-label">
            <span className="badge ok">Live</span>
          </div>
          <a href={state.url} target="_blank" rel="noreferrer" style={{ color: "var(--cursor-blue)", fontSize: 13, wordBreak: "break-all" }}>
            {state.url}
          </a>
        </div>
      </div>
      <div className="settings-row">
        <div className="row-label">Access</div>
        <select
          className="text-input"
          value={state.access}
          onChange={async (e) => {
            const res = await window.emberling.publish.access({ botId, access: e.target.value });
            if (res.ok) setState({ url: res.url, access: e.target.value });
          }}
        >
          <option value="lan">Anyone on my network</option>
          <option value="localhost">Only this computer</option>
        </select>
      </div>
      <div className="settings-row">
        <button
          className="btn"
          onClick={async () => {
            await window.emberling.publish.unpublish(botId);
            setState(null);
            toast("Bot unpublished");
          }}
        >
          Unpublish
        </button>
      </div>
    </div>
  );
}

function BotEditor({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const { setBots, toast } = useApp();
  const [draft, setDraft] = useState<Bot>(bot);
  const [knowledgeName, setKnowledgeName] = useState("");
  const [knowledgeText, setKnowledgeText] = useState("");

  const save = () => {
    if (!draft.name.trim()) return;
    setBots((list) => (list.some((b) => b.id === draft.id) ? list.map((b) => (b.id === draft.id ? draft : b)) : [...list, draft]));
    toast(`Bot ${draft.name} saved`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{bot.name ? `Edit ${bot.name}` : "New Bot"}</div>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div
              className="bot-avatar"
              style={draft.face ? { background: "#1c1c1c", border: "1px solid var(--cursor-stroke-tertiary)" } : { background: draft.color }}
            >
              {draft.face ? <DotlingFace face={draft.face} size={44} /> : draft.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <input className="text-input" style={{ width: "100%" }} placeholder="Bot name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <input className="text-input" style={{ width: "100%", marginTop: 8 }} placeholder="Short description" value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 8, fontSize: 12, color: "var(--cursor-text-tertiary)" }}>Ember faces — the Dotlings</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {DOTLING_FACES.map((f) => (
              <button
                key={f.id}
                className="chip-btn"
                title={`${f.name} — ${f.role}`}
                style={draft.face === f.id ? { borderColor: "var(--cursor-accent)" } : undefined}
                onClick={() => setDraft({ ...draft, face: f.id })}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <DotlingFace face={f.id} size={22} /> {f.name}
                </span>
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 8, fontSize: 12, color: "var(--cursor-text-tertiary)" }}>…or an emoji</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {EMOJIS.map((e) => (
              <button
                key={e}
                className="chip-btn"
                style={!draft.face && draft.emoji === e ? { borderColor: "var(--cursor-accent)" } : undefined}
                onClick={() => setDraft({ ...draft, emoji: e, face: undefined })}
              >
                {e}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 8, fontSize: 12, color: "var(--cursor-text-tertiary)" }}>Color</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setDraft({ ...draft, color: c })}
                style={{ width: 26, height: 26, borderRadius: 7, background: c, border: draft.color === c ? "2px solid #fff" : "1px solid var(--cursor-stroke-tertiary)" }}
              />
            ))}
          </div>
          <div style={{ marginBottom: 8, fontSize: 12, color: "var(--cursor-text-tertiary)" }}>Instructions — how this Bot should behave</div>
          <textarea
            className="text-input"
            style={{ width: "100%", minHeight: 90, resize: "vertical" }}
            placeholder="You are a research assistant. Always cite sources…"
            value={draft.instructions}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          />
          <div style={{ margin: "14px 0 8px", fontSize: 12, color: "var(--cursor-text-tertiary)" }}>Knowledge files</div>
          {draft.knowledge.map((k, i) => (
            <div key={i} className="list-item" style={{ padding: "8px 10px", border: "1px solid var(--cursor-stroke-quaternary)", borderRadius: 8, marginBottom: 6 }}>
              <div className="li-body">
                <div className="li-title">{k.name}</div>
                <div className="li-sub">{k.text.slice(0, 80)}…</div>
              </div>
              <button className="icon-btn" onClick={() => setDraft({ ...draft, knowledge: draft.knowledge.filter((_, j) => j !== i) })}>
                <IconTrash size={13} />
              </button>
            </div>
          ))}
          <div style={{ display: "grid", gap: 6 }}>
            <input className="text-input" placeholder="Knowledge file name (e.g. style-guide.md)" value={knowledgeName} onChange={(e) => setKnowledgeName(e.target.value)} />
            <textarea
              className="text-input"
              style={{ minHeight: 60, resize: "vertical" }}
              placeholder="Paste knowledge text…"
              value={knowledgeText}
              onChange={(e) => setKnowledgeText(e.target.value)}
            />
            <button
              className="btn"
              style={{ justifySelf: "start" }}
              onClick={async () => {
                let name = knowledgeName.trim();
                let text = knowledgeText;
                if (!name && !text) {
                  const files = await window.emberling.dialog.pickFiles();
                  if (!files?.length) return;
                  const f = files[0];
                  const res = await window.emberling.media.readText(f);
                  name = res.ok ? (res.name || "file") : (f.split(/[\\/]/).pop() || "file");
                  text = res.ok ? (res.content || "") : "(binary file)";
                }
                if (!name || !text) return;
                setDraft({ ...draft, knowledge: [...draft.knowledge, { name, text: text.slice(0, 40000) }] });
                setKnowledgeName("");
                setKnowledgeText("");
              }}
            >
              <IconPlus size={13} /> Add knowledge
            </button>
          </div>

          {/* Block B12: skills installed onto this bot */}
          <div style={{ margin: "14px 0 8px", fontSize: 12, color: "var(--cursor-text-tertiary)" }}>Skills — replayable procedures this bot follows</div>
          <SkillPicker selected={draft.skills || []} onToggle={(id) => {
            const cur = draft.skills || [];
            setDraft({ ...draft, skills: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
          }} />

          {/* Block C: team members */}
          {draft.team && (
            <>
              <div style={{ margin: "14px 0 8px", fontSize: 12, color: "var(--cursor-text-tertiary)" }}>Team members (one per line: Name — owner/member)</div>
              <textarea
                className="text-input"
                style={{ width: "100%", minHeight: 60, resize: "vertical", fontFamily: "var(--cursor-font-family-mono)", fontSize: 12 }}
                placeholder={"Alice — owner\nBob — member"}
                value={(draft.members || []).map((m) => `${m.name} — ${m.role}`).join("\n")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    members: e.target.value
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean)
                      .map((l) => {
                        const [name, role] = l.split(/—|--|-/).map((s) => s.trim());
                        return { name: name || "", role: role === "owner" ? ("owner" as const) : ("member" as const) };
                      })
                      .filter((m) => m.name),
                  })
                }
              />
            </>
          )}

          <div style={{ margin: "14px 0 8px", fontSize: 12, color: "var(--cursor-text-tertiary)" }}>Sharing</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={async () => {
                const template = { kind: "emberling-bot-template", v: 1, bot: { name: draft.name, emoji: draft.emoji, color: draft.color, face: draft.face, instructions: draft.instructions, description: draft.description, knowledge: draft.knowledge, team: draft.team } };
                const json = JSON.stringify(template);
                await window.emberling.dialog.saveExport({ defaultPath: `${draft.name.replace(/\W+/g, "-").toLowerCase()}-template.json`, content: json });
                try {
                  await navigator.clipboard.writeText(json);
                  toast("Template exported — JSON copied to clipboard too");
                } catch {
                  toast("Template exported");
                }
              }}
            >
              ⇪ Export template
            </button>
            <button
              className="btn"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  const parsed = JSON.parse(text);
                  if (parsed?.kind !== "emberling-bot-template" || !parsed.bot) throw new Error("not a template");
                  setDraft({ ...draft, ...parsed.bot });
                  toast(`Template "${parsed.bot.name}" loaded`);
                } catch (e) {
                  toast("Clipboard has no valid template JSON");
                }
              }}
            >
              ⇩ Import template
            </button>
            <button className={`btn${draft.team ? " primary" : ""}`} onClick={() => setDraft({ ...draft, team: !draft.team })}>
              {draft.team ? "👥 Team bot" : "Personal bot — make team"}
            </button>
          </div>

          <div style={{ margin: "14px 0 8px", fontSize: 12, color: "var(--cursor-text-tertiary)" }}>Publish — host this bot as a web chat on your network</div>
          <PublishControls botId={draft.id} />
        </div>
        <div className="modal-footer">
          <button className="btn subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!draft.name.trim()}>
            Save Bot
          </button>
        </div>
      </div>
    </div>
  );
}

export function BotsScreen() {
  const { bots, setBots, navigate, setConversations, setActiveConversationId, toast } = useApp();
  const [editing, setEditing] = useState<Bot | null>(null);

  const newBot = (team = false) =>
    setEditing({
      id: uid(),
      name: "",
      emoji: team ? "👥" : "🤖",
      color: COLORS[0],
      face: "orby",
      instructions: "",
      knowledge: [],
      skills: [],
      members: team ? [{ name: "You", role: "owner" as const }] : [],
      createdAt: Date.now(),
      team,
    });

  return (
    <div className="screen">
      <div className="screen-content" style={{ gridColumn: "1 / -1" }}>
        <h2>Bots</h2>
        <div className="screen-sub">Dedicated agents with their own instructions, knowledge files and personality.</div>
        <div className="bot-grid">
          <button className="bot-card" style={{ justifyContent: "center", alignItems: "center", borderStyle: "dashed", background: "transparent" }} onClick={() => newBot(false)}>
            <IconPlus size={20} />
            <span style={{ fontSize: 13 }}>New Bot</span>
          </button>
          <button className="bot-card" style={{ justifyContent: "center", alignItems: "center", borderStyle: "dashed", background: "transparent" }} onClick={() => newBot(true)}>
            <span style={{ fontSize: 20 }}>👥</span>
            <span style={{ fontSize: 13 }}>New team bot</span>
          </button>
          {bots.map((b) => (
            <div
              key={b.id}
              className="bot-card"
              onClick={() => {
                const convId = uid();
                setConversations((list) => [
                  { id: convId, title: `${b.emoji} ${b.name}`, messages: [], createdAt: Date.now(), updatedAt: Date.now(), botId: b.id, unread: 0 },
                  ...list,
                ]);
                setActiveConversationId(convId);
                toast(`Chatting with ${b.name}`);
                navigate({ kind: "chat" });
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  className="bot-avatar"
                  style={b.face ? { width: 40, height: 40, background: "#1c1c1c", border: "1px solid var(--cursor-stroke-tertiary)" } : { background: b.color, width: 36, height: 36, fontSize: 17 }}
                >
                  {b.face ? <DotlingFace face={b.face} size={40} /> : b.emoji}
                </div>
                <div className="bot-name" style={{ flex: 1 }}>
                  {b.name} {b.team && <span className="badge neutral" style={{ marginLeft: 6 }}>team</span>}
                </div>
              </div>
              <div className="bot-desc">{b.description || (b.instructions || "No instructions yet").slice(0, 90)}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--cursor-text-quaternary)" }}>
                <IconBot size={12} /> {b.knowledge.length} knowledge files
                <span style={{ flex: 1 }} />
                <button
                  className="icon-btn"
                  title="Edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(b);
                  }}
                >
                  Edit
                </button>
                <button
                  className="icon-btn"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBots((list) => list.filter((x) => x.id !== b.id));
                  }}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {editing && <BotEditor bot={editing} onClose={() => setEditing(null)} />}
      </div>
    </div>
  );
}
