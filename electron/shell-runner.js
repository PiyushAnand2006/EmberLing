// Privileged shell runner — the only module allowed to spawn a shell.
//
// Security contract:
//  1. Callers MUST have obtained explicit user approval for the script text
//     before invoking runShellScript (the agent layer enforces approval modes).
//  2. The script is validated (non-empty, no NUL bytes, length-capped).
//  3. The script is persisted to a freshly generated temp file (mode 0600)
//     and executed by absolute path — script text never enters the process
//     argument vector, so argv injection is structurally impossible.
//  4. Shells run non-interactively with no profile and cannot outlive the
//     caller's AbortSignal. Temp files are always removed.

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const IS_WINDOWS = process.platform === "win32";
const MAX_SCRIPT_LEN = 8000;

function validateScript(script) {
  if (typeof script !== "string" || !script.trim()) throw new Error("empty script");
  if (script.includes("\0")) throw new Error("invalid characters in script");
  if (script.length > MAX_SCRIPT_LEN) throw new Error("script too long");
  return script;
}

/**
 * Run a shell script that the user has already approved.
 * @param {{ script: string, cwd?: string, signal?: AbortSignal }} opts
 * @returns {Promise<{ exitCode: number|null, stdout: string, stderr: string }>}
 */
async function runShellScript(opts) {
  const script = validateScript(opts.script);
  const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : os.homedir();
  const runId = crypto.randomUUID();
  const scriptPath = IS_WINDOWS
    ? path.join(os.tmpdir(), `emberling-run-${runId}.ps1`)
    : path.join(os.tmpdir(), `emberling-run-${runId}.sh`);
  await fsp.writeFile(scriptPath, script, { mode: 0o600 });
  try {
    const argv = IS_WINDOWS
      ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath]
      : [scriptPath];
    const program = IS_WINDOWS ? "powershell.exe" : "/bin/bash";
    return await new Promise((resolve, reject) => {
      const child = spawn(program, argv, {
        cwd,
        windowsHide: true,
        signal: opts.signal,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d.toString();
      });
      child.stderr.on("data", (d) => {
        err += d.toString();
      });
      child.on("error", (e) => reject(new Error(e.message)));
      child.on("close", (code) => {
        resolve({
          exitCode: code,
          stdout: out.length > 6000 ? out.slice(0, 6000) + `\n… [truncated ${out.length - 6000} chars]` : out,
          stderr: err.length > 3000 ? err.slice(0, 3000) + `\n… [truncated ${err.length - 3000} chars]` : err,
        });
      });
    });
  } finally {
    fsp.unlink(scriptPath).catch(() => {});
  }
}

module.exports = { runShellScript, validateScript };
