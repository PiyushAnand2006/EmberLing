// Local agent store — the agent's persistent, per-agent file storage on this
// device. The original ships a cloud AgentStoreService (documents, multipart
// uploads, locks, visibility, sharing); per design, the rebuild keeps all of
// that on local disk instead.
//
// Layout (under userData/agent-store):
//   <scope>/files/<name>            latest content of each document
//   <scope>/versions/<name>.<n>     previous revisions, newest = highest n
//   <scope>/index.json              { files: { name: { version, size, mtime } } }
//
// scope = bot id when the turn runs inside a bot, "default" otherwise — so
// each agent's memory is isolated. Writes create a new revision; the last N
// revisions are kept. All paths are validated against the scope root.

const fsp = require("node:fs/promises");
const path = require("node:path");

const MAX_REVISIONS = 20;
const MAX_TEXT = 200000;

// Document names: relative paths inside the store, no traversal.
function validateName(name) {
  const s = String(name || "").trim().replace(/\\/g, "/");
  if (!s || s.length > 120) throw new Error("invalid document name");
  if (s.includes("..") || s.startsWith("/") || s.endsWith("/")) throw new Error("invalid document name");
  if (!/^[A-Za-z0-9._\- /]+$/.test(s)) throw new Error("invalid document name (use letters, digits, dot, dash, underscore, slash)");
  return s;
}

function scopeId(botId) {
  const s = String(botId || "").trim().toLowerCase();
  if (!s) return "default";
  // any id gets its own folder: sanitize to a safe directory name so
  // isolation never collapses two different agents into one scope
  const safe = s.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return safe || "default";
}

class AgentStore {
  constructor(root, botId) {
    this.scope = path.join(root, scopeId(botId));
    this.filesDir = path.join(this.scope, "files");
    this.versionsDir = path.join(this.scope, "versions");
    this.indexPath = path.join(this.scope, "index.json");
  }

  resolveDoc(name) {
    const doc = validateName(name);
    const target = path.resolve(this.filesDir, doc);
    if (target !== this.filesDir && !target.startsWith(this.filesDir + path.sep)) {
      throw new Error("document path escaped the store");
    }
    return { doc, target };
  }

  async ensureDirs() {
    await fsp.mkdir(this.filesDir, { recursive: true });
    await fsp.mkdir(this.versionsDir, { recursive: true });
  }

  async loadIndex() {
    try {
      return JSON.parse(await fsp.readFile(this.indexPath, "utf8"));
    } catch {
      return { files: {} };
    }
  }

  async saveIndex(index) {
    await this.ensureDirs();
    await fsp.writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf8");
  }

  async write(name, content) {
    const { doc, target } = this.resolveDoc(name);
    const body = String(content ?? "");
    if (body.length > MAX_TEXT) throw new Error("document too large (200k chars max)");
    await this.ensureDirs();
    const index = await this.loadIndex();
    const prev = index.files[doc];

    // keep the previous latest as a numbered revision
    if (prev) {
      try {
        await fsp.copyFile(target, path.join(this.versionsDir, doc.replace(/\//g, "__") + "." + (prev.version || 1)));
      } catch {}
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, body, "utf8");
    const version = (prev?.version || 0) + 1;
    index.files[doc] = { version, size: body.length, mtime: Date.now() };
    await this.saveIndex(index);
    // prune old revisions beyond MAX_REVISIONS
    if (prev) {
      const base = doc.replace(/\//g, "__");
      const stale = (prev.version || 1) - MAX_REVISIONS;
      if (stale > 0) await fsp.unlink(path.join(this.versionsDir, base + "." + stale)).catch(() => {});
    }
    return { ok: true, name: doc, version, size: body.length };
  }

  async read(name, version) {
    const { doc, target } = this.resolveDoc(name);
    if (version) {
      const vPath = path.join(this.versionsDir, doc.replace(/\//g, "__") + "." + Number(version));
      const content = await fsp.readFile(vPath, "utf8");
      return { ok: true, name: doc, version: Number(version), content: content.slice(0, MAX_TEXT) };
    }
    const content = await fsp.readFile(target, "utf8");
    const index = await this.loadIndex();
    return { ok: true, name: doc, version: index.files[doc]?.version || 1, content: content.slice(0, MAX_TEXT) };
  }

  async list() {
    const index = await this.loadIndex();
    const files = Object.entries(index.files)
      .map(([name, meta]) => ({ name, version: meta.version, size: meta.size, mtime: meta.mtime }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, scope: path.basename(this.scope), files };
  }

  async versions(name) {
    const { doc } = this.resolveDoc(name);
    const index = await this.loadIndex();
    const base = doc.replace(/\//g, "__");
    const found = [];
    try {
      for (const f of await fsp.readdir(this.versionsDir)) {
        const m = f.match(new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\.([0-9]+)$"));
        if (m) found.push(Number(m[1]));
      }
    } catch {}
    found.sort((a, b) => b - a);
    return { ok: true, name: doc, current: index.files[doc]?.version || 0, revisions: found };
  }

  async delete(name) {
    const { doc, target } = this.resolveDoc(name);
    const index = await this.loadIndex();
    if (!index.files[doc]) return { ok: false, error: "document not found: " + doc };
    // archive the latest into versions before deleting
    try {
      const cur = index.files[doc];
      await fsp.copyFile(target, path.join(this.versionsDir, doc.replace(/\//g, "__") + "." + cur.version));
    } catch {}
    await fsp.unlink(target).catch(() => {});
    delete index.files[doc];
    await this.saveIndex(index);
    return { ok: true, deleted: doc };
  }

  async search(query) {
    const q = String(query || "").toLowerCase();
    if (!q) return { ok: false, error: "empty query" };
    const index = await this.loadIndex();
    const hits = [];
    for (const doc of Object.keys(index.files)) {
      try {
        const content = (await fsp.readFile(path.join(this.filesDir, doc), "utf8")).toLowerCase();
        const first = content.indexOf(q);
        if (first >= 0) {
          hits.push({ name: doc, version: index.files[doc].version, excerpt: content.slice(Math.max(0, first - 40), first + 120) });
          if (hits.length >= 20) break;
        }
      } catch {}
    }
    return { ok: true, query, hits };
  }
}

module.exports = { AgentStore, validateName, scopeId, MAX_REVISIONS };
