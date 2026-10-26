// Slack integration via the Web API — real, using a bot token (xoxb-…) from
// a free Slack app the user creates. Covers messaging, reactions, channels,
// history, and search — the same surface the original wakes automations on.
const API = "https://slack.com/api";

async function call(token, method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body || {}),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`Slack ${method}: ${j.error}`);
  return j;
}

async function test(token) {
  const j = await call(token, "auth.test");
  return { ok: true, team: j.team, user: j.user };
}

async function listChannels(token) {
  const j = await call(token, "conversations.list", { limit: 200, types: "public_channel,private_channel" });
  return (j.channels || []).map((c) => ({ id: c.id, name: c.name, is_member: c.is_member }));
}

async function sendMessage(token, channel, text) {
  const j = await call(token, "chat.postMessage", { channel, text });
  return { ok: true, ts: j.ts, channel: j.channel };
}

async function addReaction(token, channel, timestamp, emoji) {
  await call(token, "reactions.add", { channel, timestamp, name: String(emoji || "thumbsup").replace(/^:+|:+$/g, "") });
  return { ok: true };
}

async function history(token, channel, limit = 20) {
  const j = await call(token, "conversations.history", { channel, limit });
  return (j.messages || []).map((m) => ({ ts: m.ts, user: m.user, text: m.text, tsDate: new Date(Number(m.ts) * 1000).toISOString() }));
}

async function searchMessages(token, query) {
  const j = await call(token, "search.messages", { query, count: 20 });
  const rows = j.messages?.matches || [];
  return rows.map((m) => ({ channel: m.channel?.name, user: m.user, text: m.text, tsDate: new Date(Number(m.ts) * 1000).toISOString() }));
}

module.exports = { test, listChannels, sendMessage, addReaction, history, searchMessages };
