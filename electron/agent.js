// Agent turn loop: stream a completion, surface status pills, execute tool
// calls through approval, feed results back, repeat — mirroring the original
// transcript protocol (status → tool line → result → reply).

const { TOOL_DEFS, executeTool, STATUS_BY_TOOL } = require("./tools");
const { streamChat, withFallback } = require("./providers");

const MAX_STEPS = 24;

function systemPrompt(opts) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `You are Emberling, a helpful desktop agent. Today is ${today}. The user is on ${process.platform}.`,
    `You can run tools on the user's computer (commands, file edits, web search/fetch, image and clip generation, computer use, subagents, MCP tools).`,
    `Prefer acting over narrating: call tools directly, keep prose short and friendly.`,
    `Use plain markdown. Embed generated photos with markdown image syntax.`,
    `Rich blocks you may emit in fenced code blocks: \`\`\`mermaid (diagrams), \`\`\`chart (JSON {type:"bar"|"line"|"pie", data, labels}), \`\`\`html (interactive preview), \`\`\`clip (already-formatted clip JSON).`,
    `When you learn a durable fact or preference about the user, save it with save_memory. Never save passwords, API keys, card numbers, or other secrets.`,
  ];
  if (opts?.botInstructions) lines.push(`Agent instructions from the user: ${opts.botInstructions}`);
  if (opts?.botKnowledge?.length) {
    lines.push(`Bot knowledge files:\n${opts.botKnowledge.map((k) => `--- ${k.name} ---\n${String(k.text).slice(0, 8000)}`).join("\n")}`);
  }
  if (opts?.memories?.length) {
    lines.push(`Known memories about the user:\n${opts.memories.map((m) => `- ${m.text}`).join("\n")}`);
  }
  return lines.join("\n");
}

/**
 * Run one agent turn.
 * events: { onStatus(text), onDelta(text), onToolCall(call), onToolResult(call, result), onApprovalRequest(call) -> Promise<bool> }
 */
async function runAgentTurn({ settings, history, approvalMode, botInstructions, botKnowledge, memories, agentTools, signal, events, toolContext, extraToolDefs }) {
  const messages = [
    { role: "system", content: systemPrompt({ botInstructions, botKnowledge, memories }) },
    ...history,
  ];
  const enabled = new Set(agentTools && agentTools.length ? agentTools : TOOL_DEFS.map((t) => t.function.name));
  const tools = [
    ...TOOL_DEFS.filter((t) => enabled.has(t.function.name)),
    ...(extraToolDefs || []),
  ];

  let finalText = "";
  let usage = null;
  for (let step = 0; step < MAX_STEPS; step++) {
    events.onStatus("Working");
    let completion;
    try {
      completion = await withFallback(settings, (config) =>
        streamChat({
          config,
          messages,
          tools,
          signal,
          onDelta: events.onDelta,
        })
      );
      if (completion.usage) usage = completion.usage;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      throw new Error(`Provider error: ${err.message}`);
    }

    if (completion.content) finalText = completion.content;

    if (!completion.toolCalls.length) {
      return { text: finalText || "(empty response)", usage };
    }

    messages.push({ role: "assistant", content: completion.content || "", tool_calls: completion.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } })) });

    for (const call of completion.toolCalls) {
      events.onToolCall(call);
      events.onStatus(STATUS_BY_TOOL[call.name] || "Working");
      let result;
      try {
        result = await executeTool(call, {
          signal,
          approvalMode,
          approve: events.onApprovalRequest,
          ...toolContext,
        });
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        result = { ok: false, error: String(err?.message || err) };
      }
      events.onToolResult(call, result);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
    }
    // loop again — the model continues with tool results
  }
  return { text: finalText || "Stopped: too many tool steps.", stopped: true, usage };
}

module.exports = { runAgentTurn };
