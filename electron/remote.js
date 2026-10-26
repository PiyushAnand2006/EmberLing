// Remote execution target ("On its computer") — runs agent tools on another
// machine over the OpenSSH client shipped with Windows 10+/macOS/Linux.
// Key-based auth is required (the app generates a keypair and prints the
// one-line setup command); commands route through validation on THIS side,
// then execute on the remote host.
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const KEY_DIR_NAME = "ssh";

function keyDir() {
  const dir = path.join(os.homedir(), ".emberling", KEY_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function keyPaths(hostKeyName) {
  const safe = String(hostKeyName || "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "default";
  return { priv: path.join(keyDir(), `id_ed25519_${safe}`), pub: `${path.join(keyDir(), `id_ed25519_${safe}`)}.pub` };
}

/**
 * Generate a dedicated ed25519 keypair for a remote target.
 * Uses the platform's ssh-keygen (Windows 10+/macOS/Linux ship one).
 * Always settles — pre-existing keys are removed first so ssh-keygen
 * never blocks on its overwrite prompt.
 */
async function generateKeyPair(hostKeyName) {
  const { priv, pub } = keyPaths(hostKeyName);
  await fsp.rm(priv, { force: true });
  await fsp.rm(pub, { force: true });
  return new Promise((resolve, reject) => {
    const child = spawn("ssh-keygen", ["-t", "ed25519", "-P", "", "-C", "emberling-remote", "-f", priv], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => reject(new Error(`ssh-keygen unavailable: ${e.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ssh-keygen failed (exit ${code}): ${err.slice(0, 300)}`));
        return;
      }
      fsp
        .readFile(pub, "utf8")
        .then((pubKey) => resolve({ privateKeyPath: priv, publicKey: pubKey.trim() }))
        .catch((e) => reject(new Error(`key generated but unreadable: ${e.message}`)));
    });
  });
}

/**
 * Run a script on the configured remote host. The script is transferred on
 * stdin and executed by the remote's default shell — no remote temp files.
 * opts: { host, port, user, keyPath, script, cwd?, signal? }
 */
function runRemoteScript(opts) {
  const { host, port, user, keyPath, script, cwd, signal } = opts;
  if (!host || !user) return Promise.reject(new Error("remote host/user not configured"));
  const shellName = process.platform === "win32" ? "powershell" : "bash";
  const argv = [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    "-p", String(port || 22),
    "-i", keyPath,
    `${user}@${host}`,
    cwd ? `cd ${JSON.stringify(cwd)} 2>/dev/null || true; exec ${JSON.stringify(shellName)} -s` : `exec ${JSON.stringify(shellName)} -s`,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", argv, { windowsHide: true, signal, stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.on("error", () => {});
    child.stdin.end(script);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => reject(new Error(`ssh failed: ${e.message}`)));
    child.on("close", (code) => {
      const t = (s, n) => (s.length > n ? s.slice(0, n) + `\n… [truncated ${s.length - n} chars]` : s);
      resolve({ exitCode: code, stdout: t(out, 6000), stderr: t(err, 3000) });
    });
  });
}

/** Quick connectivity test: runs `echo emberling-ok` remotely. */
async function testConnection(cfg) {
  const res = await runRemoteScript({ ...cfg, script: "echo emberling-ok" });
  const ok = res.exitCode === 0 && res.stdout.includes("emberling-ok");
  return { ok, detail: ok ? "connected" : `exit ${res.exitCode}: ${(res.stderr || res.stdout).slice(0, 200)}` };
}

module.exports = { generateKeyPair, runRemoteScript, testConnection, keyPaths };
