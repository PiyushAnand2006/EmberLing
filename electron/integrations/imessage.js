// iMessage via AppleScript — real on macOS (the original ships a macOS app);
// on other platforms returns a clear platform error. The agent gets send /
// recent-messages tools against the user's Messages account.
const { runShellScript } = require("../shell-runner");

const IS_MAC = process.platform === "darwin";

function appleQuote(s) {
  return JSON.stringify(String(s ?? "")).slice(0, 2000); // AppleScript string literals use the same \" escaping
}

async function send(to, text) {
  if (!IS_MAC) return { ok: false, error: `iMessage requires macOS (the Messages app); this build runs on ${process.platform}.` };
  const script = `tell application "Messages" to send ${appleQuote(text)} to buddy ${appleQuote(to)}`;
  const res = await runShellScript({ script: `osascript -e ${JSON.stringify(script)}` });
  return res.exitCode === 0 ? { ok: true } : { ok: false, error: (res.stderr || "failed").slice(0, 200) };
}

async function recent(chatGuid, limit = 10) {
  if (!IS_MAC) return { ok: false, error: "iMessage requires macOS." };
  const script = chatGuid
    ? `tell application "Messages" to get {participant of text chat ${appleQuote(chatGuid)}, text of messages 1 thru ${Math.min(20, limit)} of text chat ${appleQuote(chatGuid)}}`
    : `tell application "Messages" to get text of messages 1 thru ${Math.min(20, limit)} of text chat 1`;
  const res = await runShellScript({ script: `osascript -e ${JSON.stringify(script)}` });
  return res.exitCode === 0 ? { ok: true, content: res.stdout.slice(0, 4000) } : { ok: false, error: (res.stderr || "no chat open in Messages").slice(0, 200) };
}

module.exports = { send, recent, IS_MAC };
