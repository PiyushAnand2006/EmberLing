// MCP (Model Context Protocol) client — stdio transport, matching the
// original's mcp-server surface (command/args/env config, tool discovery,
// per-server enable + custom instructions).
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const servers = new Map(); // name -> { proc, pending: Map, nextId, tools: [], startedAt }

function startServer(cfg) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(cfg.command, cfg.args || [], {
        env: { ...process.env, ...(cfg.env || {}) },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      return reject(new Error(`spawn failed: ${err.message}`));
    }
    const entry = { proc, pending: new Map(), nextId: 1, tools: [], startedAt: Date.now() };
    servers.set(cfg.name, entry);
    let buf = "";
    proc.stdout.on("data", (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id != null && entry.pending.has(msg.id)) {
          entry.pending.get(msg.id)(msg);
          entry.pending.delete(msg.id);
        }
      }
    });
    proc.stderr.on("data", () => {});
    proc.on("error", (e) => reject(new Error(e.message)));
    proc.on("close", () => servers.delete(cfg.name));

    const call = (method, params) =>
      new Promise((res, rej) => {
        const id = entry.nextId++;
        const timer = setTimeout(() => rej(new Error(`${method} timed out`)), 20000);
        entry.pending.set(id, (msg) => {
          clearTimeout(timer);
          if (msg.error) rej(new Error(msg.error.message || "MCP error"));
          else res(msg.result);
        });
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });

    entry.call = call;
    (async () => {
      try {
        await call("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "emberling", version: "0.75.8" },
        });
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
        const listed = await call("tools/list", {});
        entry.tools = (listed.tools || []).map((t) => ({
          name: t.name,
          description: t.description || "",
          inputSchema: t.inputSchema || { type: "object", properties: {} },
        }));
        resolve({ ok: true, tools: entry.tools.map((t) => t.name) });
      } catch (err) {
        stopServer(cfg.name);
        reject(err);
      }
    })();
  });
}

function stopServer(name) {
  const entry = servers.get(name);
  if (!entry) return;
  try {
    entry.proc.kill();
  } catch {}
  servers.delete(name);
}

function stopAll() {
  for (const name of [...servers.keys()]) stopServer(name);
}

function getServer(name) {
  return servers.get(name) || null;
}

function connectedServers() {
  return [...servers.entries()].map(([name, e]) => ({ name, tools: e.tools.length }));
}

async function callTool(serverName, toolName, args) {
  const entry = servers.get(serverName);
  if (!entry) throw new Error(`MCP server "${serverName}" is not connected`);
  const result = await entry.call("tools/call", { name: toolName, arguments: args || {} });
  const text = (result.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return { ok: !result.isError, content: text.slice(0, 12000) || "(no output)" };
}

// Agent-facing tool defs for every connected server's tools (mcp_<server>_<tool>)
function agentToolDefs() {
  const defs = [];
  for (const [name, entry] of servers) {
    for (const t of entry.tools) {
      defs.push({
        type: "function",
        function: {
          name: `mcp_${sanitize(name)}_${sanitize(t.name)}`,
          description: `[${name}] ${t.description}`.slice(0, 300),
          parameters: t.inputSchema && t.inputSchema.type ? t.inputSchema : { type: "object", properties: {} },
        },
        _mcp: { server: name, tool: t.name },
      });
    }
  }
  return defs;
}

function sanitize(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
}

function resolveMcpCall(toolName) {
  // reverse lookup: mcp_<server>_<tool> against known servers
  for (const [name, entry] of servers) {
    const prefix = `mcp_${sanitize(name)}_`;
    if (toolName.startsWith(prefix)) {
      const tool = toolName.slice(prefix.length);
      if (entry.tools.some((t) => sanitize(t.name) === tool)) {
        return { server: name, tool: entry.tools.find((t) => sanitize(t.name) === tool).name };
      }
    }
  }
  return null;
}

module.exports = { startServer, stopServer, stopAll, getServer, connectedServers, callTool, agentToolDefs, resolveMcpCall };
