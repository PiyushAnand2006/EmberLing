// Cloud-agent publishing, local edition: published bots are served over HTTP
// on the LAN with a built-in web chat, mirroring the original's publish flow
// (URL, access control, live status) without the vendor backend.
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");

let server = null;
let port = 0;
const published = new Map(); // botId -> { token, access: 'lan' | 'localhost', sessions: Map }

function lanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

function chatPage(botName, token) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(botName)} · Emberling</title><style>
:root{--bg:#141414;--pane:#181818;--ink:#f0f0f0;--mut:#fcfcfc99;--brand:#f54e00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;height:100vh}
header{padding:14px 18px;border-bottom:1px solid #ffffff12;display:flex;gap:10px;align-items:center}
header .dot{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 32% 28%,#2c2c2c,#0e0e0e 72%);display:flex;align-items:center;justify-content:center;color:var(--brand);font-weight:700}
main{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:8px}
.msg{max-width:74%;padding:9px 14px;border-radius:16px;white-space:pre-wrap;word-break:break-word}
.msg.user{align-self:flex-end;background:#1c1c1c;color:#fff;border-bottom-right-radius:6px}
.msg.bot{align-self:flex-start;background:#1c1c1c0f;border-bottom-left-radius:6px}
footer{display:flex;gap:8px;padding:12px 18px;border-top:1px solid #ffffff12}
input{flex:1;background:#f0f0f008;border:1px solid #ffffff17;border-radius:10px;color:var(--ink);padding:10px 12px;font:inherit;outline:none}
button{background:var(--brand);border:0;color:#fff;border-radius:999px;width:38px;height:38px;font-size:16px;cursor:pointer}
a{color:#7bafe9}
</style></head><body>
<header><span class="dot">●</span><div><b id="nm">${escapeHtml(botName)}</b><div style="font-size:11px;color:var(--mut)">an Emberling agent · hosted locally</div></div></header>
<main id="log"><div class="msg bot">Hi! I'm ${escapeHtml(botName)} — ask me anything.</div></main>
<footer><input id="q" placeholder="Message ${escapeHtml(botName)}…" autocomplete="off"><button id="s">➤</button></footer>
<script>
const log=document.getElementById('log'),q=document.getElementById('q');
async function send(){const t=q.value.trim();if(!t)return;q.value='';log.insertAdjacentHTML('beforeend','<div class="msg user"></div>');log.lastChild.textContent=t;log.scrollTop=1e9;
 const r=await fetch('?token=${token}&message='+encodeURIComponent(t));const j=await r.json();
 log.insertAdjacentHTML('beforeend','<div class="msg bot"></div>');log.lastChild.textContent=j.reply||j.error||'(no reply)';log.scrollTop=1e9;}
document.getElementById('s').onclick=send;q.addEventListener('keydown',e=>{if(e.key==='Enter')send()});
</script></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function ensureServer(runTurn) {
  if (server) return true;
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const botId = url.pathname.split("/").filter(Boolean)[1];
    const pub = published.get(botId);
    if (!pub || url.searchParams.get("token") !== pub.token) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("This agent is not published or the link is invalid.");
    }
    if (pub.access === "localhost" && req.socket.remoteAddress !== "127.0.0.1" && !req.socket.remoteAddress.includes("::1")) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("This agent is limited to this computer.");
    }
    const message = url.searchParams.get("message");
    if (!message) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(chatPage(pub.botName, pub.token));
    }
    const reply = await runTurn(botId, message, pub.sessions);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ reply }));
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  port = server.address().port;
  return true;
}

async function publishBot({ bot, runTurn }) {
  await ensureServer(runTurn);
  let pub = published.get(bot.id);
  if (!pub) {
    pub = { token: crypto.randomUUID().slice(0, 8), access: "lan", botName: bot.name, sessions: new Map() };
    published.set(bot.id, pub);
  } else {
    pub.botName = bot.name;
  }
  const host = pub.access === "localhost" ? "127.0.0.1" : lanIp();
  return { url: `http://${host}:${port}/agent/${bot.id}?token=${pub.token}`, access: pub.access };
}

function setAccess(botId, access) {
  const pub = published.get(botId);
  if (!pub) return null;
  pub.access = access === "localhost" ? "localhost" : "lan";
  const host = pub.access === "localhost" ? "127.0.0.1" : lanIp();
  return { url: `http://${host}:${port}/agent/${botId}?token=${pub.token}`, access: pub.access };
}

function unpublishBot(botId) {
  published.delete(botId);
}

function publishState() {
  return {
    port,
    lanIp: lanIp(),
    bots: [...published.entries()].map(([id, p]) => ({ id, name: p.botName, access: p.access })),
  };
}

module.exports = { publishBot, unpublishBot, setAccess, publishState };
