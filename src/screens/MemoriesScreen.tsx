import React, { useState } from "react";
import { useApp, uid } from "../state";
import { IconPlus, IconTrash } from "../components/Icons";
import { DotlingFace } from "../components/Brand";

export function MemoriesScreen() {
  const { memories, setMemories, toast } = useApp();
  const [draft, setDraft] = useState("");

  const add = () => {
    if (!draft.trim()) return;
    setMemories((list) => [{ id: uid(), text: draft.trim(), createdAt: Date.now(), source: "user" }, ...list]);
    setDraft("");
    toast("Memory added");
  };

  return (
    <div className="screen">
      <div className="screen-content" style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <DotlingFace face="echo" size={60} />
          <h2 style={{ margin: 0 }}>Memories</h2>
        </div>
        <div className="screen-sub">
          What Emberling remembers about you across chats. The agent follows these in every conversation and never stores passwords or API keys.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            className="text-input"
            style={{ flex: 1 }}
            placeholder="e.g. I prefer concise answers and dark mode code themes"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn primary" onClick={add}>
            <IconPlus size={13} /> Add
          </button>
          <button
            className="btn"
            title="Export memories as markdown"
            onClick={async () => {
              const md = memories.map((m) => `- ${m.text}`).join("\n");
              await window.emberling.dialog.saveExport({ defaultPath: "emberling-memories.md", content: md || "(no memories)" });
            }}
          >
            Export
          </button>
        </div>
        <div className="settings-group">
          {memories.length === 0 && <div className="list-item" style={{ color: "var(--cursor-text-quaternary)" }}>Nothing remembered yet — facts you share in chat can be saved here.</div>}
          {memories.map((m) => (
            <div key={m.id} className="list-item">
              <div className="li-body">
                <div className="li-title">{m.text}</div>
                <div className="li-sub">
                  {new Date(m.createdAt).toLocaleString()} · {m.source === "user" ? "added by you" : "learned in chat"}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setMemories((list) => list.filter((x) => x.id !== m.id))}>
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
