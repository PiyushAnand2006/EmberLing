// Microsoft Teams via Microsoft Graph — real device-code OAuth (no admin
// script needed when the tenant permits user consent; works with work or
// school accounts). Covers /me, chat list, message send, message history.
//
// Client chain: first-party Microsoft public clients, tried in order. The
// first (Microsoft Office) carries broad pre-consent for Graph chat scopes;
// if the tenant refuses consent for it, the poll throws a ConsentError and
// main.js restarts the flow with the next client automatically (a fresh
// device code — the user just enters the new code).
const CANDIDATES = [
  { id: "d3590ed6-52b3-4102-aeff-aad2292ab01c", name: "Microsoft Office" },
  { id: "04b07795-8ddb-461a-bbee-02f9e1bf7b46", name: "Microsoft Azure CLI" },
];
const TENANT = "organizations"; // work/school accounts only — consumers have no Teams chats
const SCOPES = "User.Read Chat.ReadWrite ChatMessage.Send offline_access";

const AUTH = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";

// Typed error: the tenant refused these scopes for this client — restart the
// flow with the next candidate.
class ConsentError extends Error {
  constructor(description) {
    super(description || "Microsoft refused the chat permissions for this sign-in");
    this.name = "ConsentError";
  }
}

function tenantUrl(index) {
  // candidate 0+ use organizations; consumers (personal accounts) have no
  // Teams chats, so we never request the consumers tenant
  return `${AUTH}/organizations/oauth2/v2.0`;
}

async function startDeviceCode(clientIndex = 0) {
  const client = CANDIDATES[Math.min(clientIndex, CANDIDATES.length - 1)];
  const res = await fetch(`${tenantUrl()}/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.id, scope: SCOPES }).toString(),
  });
  const j = await res.json();
  if (!j.device_code) throw new Error(j.error_description || "device code request failed");
  return {
    deviceCode: j.device_code,
    userCode: j.user_code,
    verifyUrl: j.verification_uri,
    expiresIn: j.expires_in,
    interval: j.interval || 5,
    clientIndex,
    clientName: client.name,
  };
}

// Poll once (bounded by timeoutMs). Resolves with tokens on success; returns
// { pending: true } while the user hasn't finished; throws ConsentError when
// the tenant refuses the scopes (main.js restarts with the next client).
async function pollToken(deviceCode, clientIndex = 0, timeoutMs = 12000) {
  const client = CANDIDATES[Math.min(clientIndex, CANDIDATES.length - 1)];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${tenantUrl()}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: client.id,
        device_code: deviceCode,
      }).toString(),
    });
    const j = await res.json();
    if (j.access_token) {
      return { accessToken: j.access_token, refreshToken: j.refresh_token || "", expiresIn: j.expires_in || 3600 };
    }
    if (j.error === "authorization_pending") continue;
    if (j.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    // consent-type failures are restartable with the next client
    if (j.error === "invalid_grant" && /AADSTS65001|AADSTS65002|AADSTS70011|consent|not consented/i.test(j.error_description || "")) {
      throw new ConsentError(j.error_description);
    }
    if (j.error === "expired_token" || j.error === "authorization_declined") {
      throw new Error(j.error === "expired_token" ? "the device code expired — start again" : "sign-in was declined");
    }
    throw new Error(j.error_description || j.error || "token polling failed");
  }
  return { pending: true };
}

// Exchange a refresh token for fresh tokens (single-use rotation: persist
// BOTH values the call returns).
async function refresh(refreshToken) {
  if (!refreshToken) throw new Error("no refresh token stored — sign in again");
  const client = CANDIDATES[0];
  const res = await fetch(`${tenantUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: client.id,
      refresh_token: refreshToken,
      scope: SCOPES,
    }).toString(),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(j.error_description || "token refresh failed — sign in again");
  return { accessToken: j.access_token, refreshToken: j.refresh_token || refreshToken, expiresIn: j.expires_in || 3600 };
}

// Run a Graph call with transparent 401 refresh. Returns
// { result, refreshed?: {accessToken, refreshToken} } — callers persist
// `refreshed` when present. Throws ConsentError on tenant consent refusal
// after a refresh attempt (the stored consent was revoked).
async function withToken(creds, fn) {
  try {
    return { result: await fn(creds.accessToken) };
  } catch (err) {
    if (!/Graph 401/.test(String(err?.message || "")) || !creds.refreshToken) throw err;
    // dispatch via module.exports so tests can stub the token endpoint
    const fresh = await module.exports.refresh(creds.refreshToken);
    return { result: await fn(fresh.accessToken), refreshed: fresh };
  }
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
  const j = await graph(token, "/chats?$top=30&$orderBy=" + encodeURIComponent("lastMessageAt desc"));
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
  const j = await graph(token, `/chats/${encodeURIComponent(chatId)}/messages?$top=25&$orderBy=` + encodeURIComponent("createdDateTime desc"));
  return (j.value || []).map((m) => ({ from: m.from?.user?.displayName || "(app)", text: (m.body?.content || "").replace(/<[^>]+>/g, " ").trim(), at: m.createdDateTime }));
}

module.exports = { startDeviceCode, pollToken, refresh, withToken, me, listChats, sendChatMessage, chatHistory, SCOPES, ConsentError, CANDIDATES };
