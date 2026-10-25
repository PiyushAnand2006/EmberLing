// Minimal MCP stdio server used by tests: echoes text through tools/call.
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
  if (msg.method === "initialize") {
    out({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "test", version: "1.0" } } });
  } else if (msg.method === "tools/list") {
    out({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        tools: [
          {
            name: "echo_tool",
            description: "Echoes text",
            inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
          },
        ],
      },
    });
  } else if (msg.method === "tools/call") {
    out({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "echo: " + (msg.params.arguments.text || "") }] } });
  } else if (msg.method && msg.id != null) {
    out({ jsonrpc: "2.0", id: msg.id, result: {} });
  }
});
