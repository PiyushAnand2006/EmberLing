// Block B12: Skills — reusable, replayable procedures the user teaches or
// writes, installed onto bots. Store shape:
// [{ id, name, instructions, steps[], tools[], createdAt, source }]
// Teach mode ("learn from demonstration") saves captured procedures here.
const crypto = require("node:crypto");

function list(store) {
  const rows = store.load("skills", []);
  return Array.isArray(rows) ? rows : [];
}

function upsert(store, skill) {
  const rows = list(store);
  const entry = {
    id: skill.id || crypto.randomUUID(),
    name: String(skill.name || "").trim().slice(0, 80) || "Untitled skill",
    instructions: String(skill.instructions || "").slice(0, 8000),
    steps: (skill.steps || []).slice(0, 30).map((s) => String(s).slice(0, 500)),
    tools: (skill.tools || []).slice(0, 15).map((t) => String(t).slice(0, 40)),
    source: skill.source || "user",
    createdAt: skill.createdAt || Date.now(),
  };
  const idx = rows.findIndex((s) => s.id === entry.id || s.name.toLowerCase() === entry.name.toLowerCase());
  if (idx >= 0) rows[idx] = { ...rows[idx], ...entry, id: rows[idx].id };
  else rows.unshift(entry);
  store.update("skills", () => rows);
  return { ok: true, id: entry.id };
}

function remove(store, id) {
  store.update("skills", (rows) => (Array.isArray(rows) ? rows : []).filter((s) => s.id !== id));
  return { ok: true };
}

function get(store, idOrName) {
  const key = String(idOrName || "").toLowerCase();
  return (
    list(store).find((s) => s.id === idOrName) ||
    list(store).find((s) => s.name.toLowerCase() === key) ||
    null
  );
}

module.exports = { list, upsert, remove, get };
