// Block B14: Contacts — a local address book the agent can reference.
// Store shape: [{ id, name, tags[], emails[], phones[], notes, createdAt }]
const crypto = require("node:crypto");

function normalize(rows) {
  return Array.isArray(rows) ? rows : [];
}

function list(store) {
  return normalize(store.load("contacts", []));
}

function search(store, query) {
  const q = String(query || "").toLowerCase().trim();
  const rows = list(store);
  if (!q) return rows;
  return rows.filter((c) =>
    c.name?.toLowerCase().includes(q) ||
    c.notes?.toLowerCase().includes(q) ||
    (c.tags || []).some((t) => String(t).toLowerCase().includes(q)) ||
    (c.emails || []).some((e) => String(e).toLowerCase().includes(q)) ||
    (c.phones || []).some((p) => String(p).includes(q))
  );
}

function upsert(store, contact) {
  const rows = list(store);
  const entry = {
    id: contact.id || crypto.randomUUID(),
    name: String(contact.name || "").trim().slice(0, 80),
    tags: (contact.tags || []).map((t) => String(t).slice(0, 30)).slice(0, 8),
    emails: (contact.emails || []).map((e) => String(e).slice(0, 120)).slice(0, 5),
    phones: (contact.phones || []).map((p) => String(p).slice(0, 40)).slice(0, 5),
    notes: String(contact.notes || "").slice(0, 2000),
    createdAt: contact.createdAt || Date.now(),
  };
  if (!entry.name) throw new Error("contact needs a name");
  const idx = rows.findIndex((c) => c.id === entry.id || c.name.toLowerCase() === entry.name.toLowerCase());
  if (idx >= 0) rows[idx] = { ...rows[idx], ...entry, id: rows[idx].id };
  else rows.unshift(entry);
  store.update("contacts", () => rows);
  return { ok: true, id: entry.id, name: entry.name };
}

function remove(store, id) {
  store.update("contacts", (rows) => normalize(rows).filter((c) => c.id !== id));
  return { ok: true };
}

module.exports = { list, search, upsert, remove };
