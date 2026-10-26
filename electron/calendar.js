// Block B16: local calendar — events store + ICS export/import. The original
// syncs work calendars; this is the honest local equivalent the agent can
// read and write.
const crypto = require("node:crypto");

function list(store) {
  const rows = store.load("calendar", []);
  return Array.isArray(rows) ? rows.sort((a, b) => a.start - b.start) : [];
}

function upsert(store, ev) {
  const rows = store.load("calendar", []);
  const start = Date.parse(ev.start);
  if (!Number.isFinite(start)) throw new Error("event start must be a parseable date");
  const end = Date.parse(ev.end) || start + 3600_000;
  const entry = {
    id: ev.id || crypto.randomUUID(),
    title: String(ev.title || "").trim().slice(0, 120) || "(untitled)",
    start,
    end,
    notes: String(ev.notes || "").slice(0, 2000),
    location: String(ev.location || "").slice(0, 120),
  };
  const idx = rows.findIndex((e) => e.id === entry.id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...entry };
  else rows.push(entry);
  store.update("calendar", () => rows);
  return { ok: true, id: entry.id };
}

function remove(store, id) {
  store.update("calendar", (rows) => (Array.isArray(rows) ? rows : []).filter((e) => e.id !== id));
  return { ok: true };
}

function upcoming(store, days = 14) {
  const now = Date.now();
  return list(store).filter((e) => e.end >= now && e.start <= now + days * 86400_000);
}

function toIcs(events) {
  const fmt = (ts) => new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Emberling//Calendar//EN", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@emberling`,
      `DTSTAMP:${fmt(Date.now())}`,
      `DTSTART:${fmt(e.start)}`,
      `DTEND:${fmt(e.end)}`,
      `SUMMARY:${String(e.title).replace(/\r?\n/g, " ")}`,
      e.location ? `LOCATION:${String(e.location).replace(/\r?\n/g, " ")}` : "",
      e.notes ? `DESCRIPTION:${String(e.notes).replace(/\r?\n/g, "\\n")}` : "",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

function parseIcs(text) {
  const events = [];
  const blocks = String(text).split(/BEGIN:VEVENT/).slice(1);
  for (const b of blocks) {
    const get = (key) => {
      const m = b.match(new RegExp(`^${key}[^:\\r\\n]*:(.+)$`, "mi"));
      return m ? m[1].trim() : "";
    };
    const parseTs = (v) => {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return t;
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
      if (!m) return NaN;
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] || 0, +m[5] || 0, +m[6] || 0);
    };
    const start = parseTs(get("DTSTART"));
    if (!Number.isFinite(start)) continue;
    events.push({
      id: crypto.randomUUID(),
      title: get("SUMMARY") || "(imported event)",
      start,
      end: parseTs(get("DTEND")) || start + 3600_000,
      location: get("LOCATION"),
      notes: get("DESCRIPTION").replace(/\\n/g, "\n"),
    });
  }
  return events;
}

function importIcs(store, text) {
  const events = parseIcs(text);
  const rows = store.load("calendar", []);
  store.update("calendar", () => [...(Array.isArray(rows) ? rows : []), ...events]);
  return { ok: true, imported: events.length };
}

module.exports = { list, upsert, remove, upcoming, toIcs, importIcs };
