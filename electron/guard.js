// Self-protection firewall — the local edition of the original's execution
// policy engine (workspace_readwrite boundaries, writeProtectionMapping,
// additionalReadonlyPaths, allowlistEscalated). Guards the agent against
// modifying its own application code, its security settings, or killing its
// own process — the "self-modification" class of failures.
//
// Pure functions here; main.js supplies the electron-specific roots.
// Denials from this module are non-negotiable: user approval modes and
// auto-review rules cannot override them.

const path = require("node:path");

// Security-gating config files (approval mode, tool toggles, auto-review
// rules, credentials, MCP servers = arbitrary command execution). A prompt
// injection or confused agent must not be able to rewrite these by hand.
const CONFIG_FILES = new Set(["settings.json", "integrations.json", "mcp.json", "automations.json"]);

const norm = (p) => String(p || "").replace(/\//g, "\\").toLowerCase().replace(/\\+$/, "");
const wsl = (p) => {
  const m = norm(p).match(/^([a-z]):\\(.*)$/);
  return m ? "/mnt/" + m[1] + "/" + m[2].replace(/\\/g, "/") : norm(p);
};

/**
 * @param {{roots: string[], userDataDir: string}} opts
 *   roots — directories the agent may never modify (install dir, resources,
 *   main-process code, built output, electron runtime)
 *   userDataDir — the config dir; its security-gating JSON files are protected
 */
function createGuard({ roots, userDataDir }) {
  // roots are normalized the same way as targets (separators + case) so the
  // prefix checks are case-insensitive like the Windows filesystem
  const rootList = [...new Set((roots || []).filter(Boolean).map((r) => norm(path.resolve(r))))];
  const configDir = norm(path.resolve(userDataDir || ""));

  const rootHits = (p) => rootList.some((r) => p === r || p.startsWith(r + "\\"));

  // a write is blocked when the target is inside a protected root, is the
  // application bundle itself, or is one of the security config files
  function checkWrite(target) {
    const p = norm(path.resolve(String(target || "")));
    if (p.endsWith(".asar")) return "the application bundle (.asar)";
    if (rootHits(p)) return "the application's own code";
    if (configDir && (p === configDir || p.startsWith(configDir + "\\"))) {
      const base = path.basename(p);
      if (CONFIG_FILES.has(base)) return "a security configuration file (" + base + ")";
    }
    return null;
  }

  // shell commands: deny self-kill and any reference to protected roots or
  // the app bundle (checked in both Windows and WSL path forms, since the
  // sandbox can reach the same files through /mnt/<drive>)
  function checkCommand(script) {
    const low = norm(script);
    const reasons = [];
    if (/(taskkill|stop-process)[^;|&]*(emberling|grok\s?bot)/i.test(low)) reasons.push("killing the running app");
    for (const r of rootList) {
      const win = norm(r);
      const lin = wsl(r);
      if (low.includes(win) && /(remove-item|ri |del |rd |rmdir|rm |rm -|mv |move-item|rename-item|set-content|out-file|ac )/i.test(low)) {
        reasons.push("modifying the application's own code");
        break;
      }
      if (low.includes(lin)) {
        reasons.push("modifying the application's own code");
        break;
      }
    }
    for (const f of CONFIG_FILES) {
      if (low.includes(f) && (low.includes(configDir.toLowerCase()) || (low.includes("\\emberling\\") || low.includes("/emberling/"))) && /(set-content|out-file|ac |add-content|>|>>|remove-item|del )/i.test(low)) {
        reasons.push("rewriting a security configuration file (" + f + ")");
        break;
      }
    }
    return reasons[0] || null;
  }

  /**
   * Tool-entry check. Returns a denial reason string, or null to allow.
   * write/edit — path guard; run_command — script guard; everything else null.
   */
  function check(name, args) {
    const a = args || {};
    if (name === "write_file" || name === "store_write") {
      if (name === "write_file") return checkWrite(a.path);
      return null;
    }
    if (name === "edit_file") return checkWrite(a.path);
    if (name === "run_command") return checkCommand(a.command);
    return null;
  }

  return { check, checkWrite, checkCommand, rootList };
}

module.exports = { createGuard, CONFIG_FILES };
