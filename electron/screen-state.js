// Per-Dotling virtual screen state — what the bot's VM last did, persisted
// beside its agent store so the UI can render the bot's "screen" panel
// (the original's cloud-VM screen, kept local like everything else).
const fsp = require("node:fs/promises");
const path = require("node:path");

// screen.json lives in the same per-scope dir as the agent store files
function screenPath(storeRoot, botId) {
  const { scopeId } = require("./agent-store");
  return path.join(storeRoot, scopeId(botId), "screen.json");
}

// Called after every VM command routed for a Dotling: record the last action
// so "<Name>'s screen" can show it. Bounded output; never throws.
async function recordScreenActivity(storeRoot, botId, entry) {
  try {
    const file = screenPath(storeRoot, botId);
    const prev = await readScreen(storeRoot, botId);
    const next = {
      ts: Date.now(),
      tool: String(entry?.tool || "").slice(0, 40),
      cmd: String(entry?.cmd || "").slice(0, 200),
      exitCode: entry?.exitCode ?? null,
      out: String(entry?.out || "").slice(0, 600),
    };
    // rolling trail: last 6 actions (newest first) — the "screen" feed
    const trail = [{ ...next }, ...(prev.trail || [])].slice(0, 6);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, JSON.stringify({ ...next, trail }, null, 2), "utf8");
  } catch {}
}

async function readScreen(storeRoot, botId) {
  try {
    return JSON.parse(await fsp.readFile(screenPath(storeRoot, botId), "utf8"));
  } catch {
    return {};
  }
}

// "Acting on the screen" while a VM action is recent (< 90s old)
function isActing(screen) {
  return !!(screen?.ts && Date.now() - screen.ts < 90_000);
}

module.exports = { recordScreenActivity, readScreen, isActing, screenPath };
