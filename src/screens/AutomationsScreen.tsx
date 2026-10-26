import React, { useEffect, useState } from "react";
import { useApp, uid } from "../state";
import type { Automation } from "../types";
import { IconPlus, IconTrash, IconClock } from "../components/Icons";
import { Tempo } from "../components/Brand";

function AutomationEditor({ automation, onClose }: { automation: Automation; onClose: () => void }) {
  const { setAutomations, toast, bots } = useApp();
  const [draft, setDraft] = useState<Automation>(automation);

  const save = () => {
    if (!draft.name.trim() || !draft.prompt.trim()) return;
    setAutomations((list) => (list.some((a) => a.id === draft.id) ? list.map((a) => (a.id === draft.id ? draft : a)) : [...list, draft]));
    toast(`Automation "${draft.name}" saved`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{automation.name ? `Edit ${automation.name}` : "New automation"}</div>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <input className="text-input" style={{ width: "100%" }} placeholder="Name (e.g. Morning news digest)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <textarea
            className="text-input"
            style={{ width: "100%", minHeight: 80, marginTop: 10, resize: "vertical" }}
            placeholder="What should Emberling do? (e.g. Search the web for AI news and summarize the top 5 stories in bullets.)"
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <select
              className="text-input"
              value={draft.schedule.type}
              onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, type: e.target.value as "minutes" | "daily" } })}
            >
              <option value="daily">Every day at</option>
              <option value="minutes">Every N minutes</option>
            </select>
            {draft.schedule.type === "daily" ? (
              <input
                className="text-input"
                style={{ width: 100 }}
                type="time"
                value={draft.schedule.time || "09:00"}
                onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, time: e.target.value } })}
              />
            ) : (
              <input
                className="text-input"
                style={{ width: 120 }}
                type="number"
                min={1}
                value={draft.schedule.minutes || 60}
                onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, minutes: Number(e.target.value) || 60 } })}
              />
            )}
            <select className="text-input" value={draft.botId || ""} onChange={(e) => setDraft({ ...draft, botId: e.target.value })}>
              <option value="">Run as Emberling</option>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  Run as {b.emoji} {b.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 12, color: "var(--cursor-text-tertiary)", marginTop: 10 }}>
            Runs while the app is open (tray counts). Results appear in a dedicated chat with a notification.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!draft.name.trim() || !draft.prompt.trim()}>
            Save automation
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutomationsScreen() {
  const { automations, setAutomations, toast } = useApp();
  const [editing, setEditing] = useState<Automation | null>(null);

  return (
    <div className="screen">
      <div className="screen-content" style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Tempo size={52} />
          <h2 style={{ margin: 0 }}>Automations</h2>
        </div>
        <div className="screen-sub">Scheduled prompts that run on their own — like the original's routines and Slack/repo triggers, driven locally.</div>
        <div style={{ marginBottom: 14 }}>
          <button
            className="btn primary"
            onClick={() =>
              setEditing({
                id: uid(),
                name: "",
                prompt: "",
                enabled: true,
                schedule: { type: "daily", time: "09:00" },
                lastRun: null,
                botId: "",
              })
            }
          >
            <IconPlus size={13} /> New automation
          </button>
        </div>
        <div className="settings-group">
          {automations.length === 0 && (
            <div className="list-item" style={{ color: "var(--cursor-text-quaternary)" }}>
              <IconClock size={14} /> No automations yet — create a morning digest or a repo watcher.
            </div>
          )}
          {automations.map((a) => (
            <div key={a.id} className="list-item">
              <button className={`toggle${a.enabled ? " on" : ""}`} onClick={() => setAutomations((list) => list.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)))} />
              <div className="li-body">
                <div className="li-title">{a.name}</div>
                <div className="li-sub">
                  {a.schedule.type === "daily" ? `Daily at ${a.schedule.time}` : `Every ${a.schedule.minutes} min`} ·{" "}
                  {a.lastRun ? `last ran ${new Date(a.lastRun).toLocaleString()}` : "never ran"} · {a.prompt.slice(0, 80)}
                </div>
              </div>
              <button className="icon-btn" title="Edit" onClick={() => setEditing(a)}>
                Edit
              </button>
              <button className="icon-btn" onClick={() => setAutomations((list) => list.filter((x) => x.id !== a.id))}>
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
        {editing && <AutomationEditor automation={editing} onClose={() => setEditing(null)} />}
        <CalendarPanel />
      </div>
    </div>
  );
}

/* ---------------- Block B16: local calendar ---------------- */
function CalendarPanel() {
  const { toast } = useApp();
  const [events, setEvents] = useState<any[]>([]);
  const [draft, setDraft] = useState({ title: "", start: "", location: "", notes: "" });

  const refresh = async () => setEvents(((await window.emberling.calendar.list()) || []).slice(0, 30));
  React.useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!draft.title.trim() || !draft.start) return;
    const res = await window.emberling.calendar.upsert({ title: draft.title.trim(), start: new Date(draft.start).toISOString(), location: draft.location, notes: draft.notes });
    if (res.ok) {
      setDraft({ title: "", start: "", location: "", notes: "" });
      toast("Event added — the agent sees it with calendar_list");
      refresh();
    }
  };

  return (
    <>
      <h2 style={{ marginTop: 28 }}>Calendar</h2>
      <div className="screen-sub">Local events the agent can read and create (calendar_list / calendar_add). Import and export work with .ics files.</div>
      <div className="settings-group">
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="text-input" style={{ flex: 2, minWidth: 160 }} placeholder="Event title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <input className="text-input" style={{ flex: 1, minWidth: 190 }} type="datetime-local" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="text-input" style={{ flex: 1, minWidth: 140 }} placeholder="Location (optional)" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            <input className="text-input" style={{ flex: 2, minWidth: 180 }} placeholder="Notes (optional)" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            <button className="btn primary" onClick={add} disabled={!draft.title.trim() || !draft.start}>
              <IconPlus size={13} /> Add event
            </button>
          </div>
        </div>
      </div>
      <div className="settings-group">
        {events.length === 0 && <div className="list-item" style={{ color: "var(--cursor-text-quaternary)" }}>No upcoming events.</div>}
        {events.map((e) => (
          <div className="list-item" key={e.id}>
            <div className="li-body">
              <div className="li-title">{e.title}</div>
              <div className="li-sub">
                {new Date(e.start).toLocaleString()} {e.location ? `· ${e.location}` : ""}
              </div>
            </div>
            <button className="icon-btn" onClick={async () => { await window.emberling.calendar.remove(e.id); refresh(); }}>
              <IconTrash size={14} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          className="btn"
          onClick={async () => {
            const res = await window.emberling.calendar.exportIcs();
            if (res.ok) toast("Calendar exported");
          }}
        >
          ⇪ Export .ics
        </button>
        <button
          className="btn"
          onClick={async () => {
            const res = await window.emberling.calendar.importIcs();
            if (res.ok) {
              toast(`Imported ${(res as any).imported} events`);
              refresh();
            }
          }}
        >
          ⇩ Import .ics
        </button>
      </div>
    </>
  );
}
