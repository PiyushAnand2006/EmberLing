// 1Password integration — shells out to the official `op` CLI (free from
// 1Password) when it is installed and signed in. Tools: item list, item read.
const { spawn } = require("node:child_process");

function opRun(args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("op", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return resolve({ ok: false, error: `op CLI unavailable: ${e.message}` });
    }
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: "op timed out — is the 1Password CLI installed and signed in? (`op account list`)" });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `op CLI unavailable: ${e.message}. Install: https://developer.1password.com/docs/cli/get-started` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout: out.slice(0, 12000), error: code !== 0 ? (err || `exit ${code}`).slice(0, 300) : undefined });
    });
  });
}

async function available() {
  const r = await opRun(["--version"], 8000);
  return { available: !!r.ok, version: (r.stdout || "").trim() || undefined, error: r.error };
}

async function listItems(vault) {
  const args = ["item", "list", "--format", "json"];
  if (vault) args.push("--vault", String(vault));
  const r = await opRun(args);
  if (!r.ok) return r;
  try {
    const rows = JSON.parse(r.stdout);
    return { ok: true, items: rows.map((i) => ({ id: i.id, title: i.title, vault: i.vault?.id, category: i.category })) };
  } catch {
    return { ok: false, error: "could not parse op output" };
  }
}

async function readItem(referenceOrTitle, vault) {
  const ref = String(referenceOrTitle).startsWith("op://")
    ? String(referenceOrTitle)
    : `op://${vault || "Private"}/${referenceOrTitle}/notesPlain`;
  const r = await opRun(["read", ref, "--force"]);
  return r.ok ? { ok: true, content: r.stdout.slice(0, 12000) } : r;
}

module.exports = { available, listItems, readItem };
