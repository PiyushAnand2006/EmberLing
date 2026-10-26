// Real email integration: SMTP send (nodemailer) + IMAP search/read
// (imapflow). Works with any provider mailbox using an app password
// (Gmail, Outlook, Fastmail, self-hosted...). Deps are lazy-required so the
// app boots fine before `npm install` picks them up.
let nodemailer = null;
let ImapFlow = null;
function ensureDeps() {
  try {
    nodemailer = nodemailer || require("nodemailer");
    ImapFlow = ImapFlow || require("imapflow").ImapFlow;
  } catch {
    throw new Error("email libraries missing — run `npm install` (nodemailer, imapflow)");
  }
}

function smtpConfig(cfg) {
  return {
    host: cfg.smtpHost,
    port: Number(cfg.smtpPort) || 587,
    secure: cfg.smtpSecure === true || Number(cfg.smtpPort) === 465,
    auth: { user: cfg.user, pass: cfg.password },
  };
}

async function send(cfg, { to, subject, body, cc }) {
  ensureDeps();
  const transport = nodemailer.createTransport(smtpConfig(cfg));
  const info = await transport.sendMail({ from: cfg.user, to, cc: cc || undefined, subject: String(subject || "(no subject)").replace(/[\r\n]+/g, " "), text: String(body || "") });
  return { ok: true, messageId: info.messageId, accepted: info.accepted };
}

async function search(cfg, { query, mailbox, limit }) {
  ensureDeps();
  const client = new ImapFlow({ host: cfg.imapHost, port: Number(cfg.imapPort) || 993, secure: true, auth: { user: cfg.user, pass: cfg.password }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(String(mailbox || "INBOX"));
    const rows = [];
    try {
      const criteria = query ? { header: ["subject", String(query).slice(0, 120)] } : { since: new Date(Date.now() - 30 * 24 * 3600 * 1000) };
      for await (const msg of client.fetch(criteria, { envelope: true, uid: true })) {
        rows.push({
          uid: msg.uid,
          from: msg.envelope?.from?.[0] ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address}>` : "?",
          subject: msg.envelope?.subject || "(no subject)",
          date: msg.envelope?.date,
        });
        if (rows.length >= Math.min(30, limit || 15)) break;
      }
    } finally {
      lock.release();
    }
    return { ok: true, results: rows };
  } finally {
    client.close().catch(() => {});
  }
}

async function read(cfg, { mailbox, uid }) {
  ensureDeps();
  const client = new ImapFlow({ host: cfg.imapHost, port: Number(cfg.imapPort) || 993, secure: true, auth: { user: cfg.user, pass: cfg.password }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(String(mailbox || "INBOX"));
    let out = { ok: false, error: "message not found" };
    try {
      const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
      if (msg) {
        const text = msg.source ? Buffer.from(msg.source).toString("utf8") : "";
        const body = text.split(/\r?\n\r?\n/).slice(1).join("\n\n").slice(0, 12000) || text.slice(0, 12000);
        out = { ok: true, subject: msg.envelope?.subject, from: msg.envelope?.from?.[0]?.address, body };
      }
    } finally {
      lock.release();
    }
    return out;
  } finally {
    client.close().catch(() => {});
  }
}

async function verify(cfg) {
  ensureDeps();
  const transport = nodemailer.createTransport({ ...smtpConfig(cfg), connectionTimeout: 10000 });
  await transport.verify();
  return { ok: true, smtp: "ready" };
}

module.exports = { send, search, read, verify };
