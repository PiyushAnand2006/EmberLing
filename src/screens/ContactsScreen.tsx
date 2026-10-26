import React, { useEffect, useState } from "react";
import { useApp, uid } from "../state";

// Block B14: local address book — the agent's contacts_list/contacts_add
// tools read/write this store.
export function ContactsScreen() {
  const { toast } = useApp();
  const [contacts, setContacts] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ name: "", emails: "", phones: "", tags: "", notes: "" });

  const refresh = async () => setContacts((await window.emberling.contacts.list()) || []);
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!draft.name.trim()) return;
    await window.emberling.contacts.upsert({
      name: draft.name.trim(),
      emails: draft.emails.split(/[,;]\s*/).filter(Boolean),
      phones: draft.phones.split(/[,;]\s*/).filter(Boolean),
      tags: draft.tags.split(/[,;]\s*/).filter(Boolean),
      notes: draft.notes,
    });
    setDraft({ name: "", emails: "", phones: "", tags: "", notes: "" });
    toast("Contact saved");
    refresh();
  };

  const visible = query
    ? contacts.filter((c) => JSON.stringify(c).toLowerCase().includes(query.toLowerCase()))
    : contacts;

  return (
    <div className="screen">
      <div className="screen-content" style={{ gridColumn: "1 / -1" }}>
        <h2>Contacts</h2>
        <div className="screen-sub">Local address book — the agent reads it with contacts_list and can add people itself.</div>
        <div className="settings-group" style={{ marginBottom: 14 }}>
          <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="text-input" style={{ flex: 1, minWidth: 140 }} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <input className="text-input" style={{ flex: 1, minWidth: 160 }} placeholder="Emails (comma-separated)" value={draft.emails} onChange={(e) => setDraft({ ...draft, emails: e.target.value })} />
              <input className="text-input" style={{ flex: 1, minWidth: 140 }} placeholder="Phones (comma-separated)" value={draft.phones} onChange={(e) => setDraft({ ...draft, phones: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="text-input" style={{ flex: 1, minWidth: 140 }} placeholder="Tags (e.g. work, client)" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
              <input className="text-input" style={{ flex: 2, minWidth: 180 }} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              <button className="btn primary" onClick={add} disabled={!draft.name.trim()}>
                Add contact
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input className="text-input" style={{ flex: 1 }} placeholder="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="settings-group">
          {visible.length === 0 && <div className="list-item" style={{ color: "var(--cursor-text-quaternary)" }}>No contacts yet.</div>}
          {visible.map((c) => (
            <div className="list-item" key={c.id}>
              <div className="li-body">
                <div className="li-title">
                  {c.name} {(c.tags || []).map((t: string) => <span key={t} className="badge neutral" style={{ marginLeft: 6 }}>{t}</span>)}
                </div>
                <div className="li-sub">
                  {(c.emails || []).concat(c.phones || []).join(" · ") || "—"} {c.notes ? ` · ${c.notes.slice(0, 80)}` : ""}
                </div>
              </div>
              <button
                className="icon-btn"
                onClick={async () => {
                  await window.emberling.contacts.remove(c.id);
                  refresh();
                }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
