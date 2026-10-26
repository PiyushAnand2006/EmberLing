// Microsoft Teams via Microsoft Graph — real device-code OAuth (no admin
// script needed when the tenant permits user consent; works with work or
// school accounts). Covers /me, chat list, message send, message history.
// Microsoft's own Azure CLI public client id — the standard well-known
// client for device-code flows against Graph (no app registration needed).
const CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
const TENANT = "common";
const SCOPES = "User.Read Chat.ReadWrite ChatMessage.Send offline_access";

const AUTH = `https://login.microsoftonline.com/${TENANT}`;
const GRAPH = "https://graph.microsoft.com/v1.0";

async function startDeviceCode() {
  const res = await fetch(`${AUTH}/oauth2/v2.0/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPES }).toString(),
  });
  const j = await res.json();
  if (!j.device_code) throw new Error(j.error_description || "device code request failed");
  return { deviceCode: j.device_code, userCode: j.user_code, verifyUrl: j.verification_uri, expiresIn: j.expires_in, interval: j.interval || 5 };
}

async function pollToken(deviceCode, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${AUTH}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: CLIENT_ID,
        device_code: deviceCode,
      }).toString(),
    });
    const j = await res.json();
    if (j.access_token) return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresIn: j.expires_in };
    if (j.error === "authorization_pending") continue;
    if (j.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    throw new Error(j.error_description || j.error || "token polling failed");
  }
  throw new Error("timed out waiting for Microsoft sign-in");
}

async function graph(token, path, init) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let j;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = text;
  }
  if (!res.ok) throw new Error(`Graph ${res.status}: ${typeof j === "string" ? j.slice(0, 200) : (j && (j.error?.message || j.message)) || "error"}`);
  return j;
}

async function me(token) {
  const j = await graph(token, "/me");
  return { name: j.displayName, mail: j.mail || j.userPrincipalName, id: j.id };
}

async function listChats(token) {
  const j = await graph(token, "/chats?$top=30&$orderBy=lastMessageAt desc");
  return (j.value || []).map((c) => ({ id: c.id, topic: c.topic || "(chat)", type: c.chatType, last: c.lastMessageAt }));
}

async function sendChatMessage(token, chatId, text) {
  await graph(token, `/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body: { contentType: "html", content: text } }),
  });
  return { ok: true };
}

async function chatHistory(token, chatId) {
  const j = await graph(token, `/chats/${encodeURIComponent(chatId)}/messages?$top=25&$orderBy=createdDateTime desc`);
  return (j.value || []).map((m) => ({ from: m.from?.user?.displayName || "(app)", text: (m.body?.content || "").replace(/<[^>]+>/g, " ").trim(), at: m.createdDateTime }));
}

module.exports = { startDeviceCode, pollToken, me, listChats, sendChatMessage, chatHistory, SCOPES };
