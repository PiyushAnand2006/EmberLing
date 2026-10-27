// Agent turn loop: stream a completion, surface status pills, execute tool
// calls through approval, feed results back, repeat — mirroring the original
// transcript protocol (status → tool line → result → reply).

const providers = require("./providers");
const { TOOL_DEFS, executeTool, STATUS_BY_TOOL } = require("./tools");
const integTools = require("./integration-tools");
const INTEG_STATUS = integTools.STATUS_BY_TOOL;

const MAX_STEPS = 24;

function systemPrompt(opts) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `You are Emberling, a helpful desktop agent. Today is ${today}. The user is on ${process.platform}.`,
    `You can run tools on the user's computer (commands, file edits, web search/fetch, image and clip generation, computer use, subagents, MCP tools).`,
    `Prefer acting over narrating: call tools directly, keep prose short and friendly.`,
    `Use plain markdown. Embed generated photos with markdown image syntax.`,
    `Rich blocks you may emit in fenced code blocks: \`\`\`mermaid (diagrams), \`\`\`chart (JSON {type:"bar"|"line"|"pie"|"area"|"scatter"|"donut", data, labels, x?, y?}), \`\`\`graph (JSON {nodes:[{id,label}], edges:[{source,target}]}), \`\`\`three (JSON {shape:"sphere"|"points"|"torus"|"cube", count, color}), \`\`\`html (interactive preview), \`\`\`clip (already-formatted clip JSON).`,
    `When you learn a durable fact or preference about the user, save it with save_memory. Never save passwords, API keys, card numbers, or other secrets.`,
  ];
  if (opts?.botInstructions) lines.push(`Agent instructions from the user: ${opts.botInstructions}`);
  if (opts?.botKnowledge?.length) {
    lines.push(`Bot knowledge files:\n${opts.botKnowledge.map((k) => `--- ${k.name} ---\n${String(k.text).slice(0, 8000)}`).join("\n")}`);
  }
  if (opts?.botSkills?.length) {
    lines.push(
      `Installed skills (replayable procedures — follow the steps when the task matches):\n${opts.botSkills
        .map((s) => `--- Skill: ${s.name} ---\n${s.instructions}${s.steps?.length ? "\nSteps:\n" + s.steps.map((st, i) => `${i + 1}. ${st}`).join("\n") : ""}`)
        .join("\n")}`
    );
  }
  if (opts?.mcpInstructions) {
    lines.push(`MCP server usage instructions from the user:\n${opts.mcpInstructions}`);
  }
  if (opts?.memories?.length) {
    lines.push(`Known memories about the user:\n${opts.memories.map((m) => `- ${m.text}`).join("\n")}`);
  }
  return lines.join("\n");
}

/* ---------- text-mode tool protocol ----------
 * Keyless providers (Pollinations) reject the OpenAI `tools` parameter, so the
 * model there can't make API-level tool calls. For those providers we describe
 * the tools in the system prompt and let the model request them as text; the
 * requests are parsed, executed, and the result fed back as a plain message.
 * Also matches the tool-call shapes small models leak into plain text
 * (Mistral [TOOL_CALLS], GPT-OSS harmony "to=functions.NAME"). */

const TOOL_MARKER_RE = /```tool[^\S\n]*\n?([\s\S]*?)```/i;
const TOOL_CALLS_RE = /\[TOOL_CALLS\]\s*(\[[\s\S]*?\]|\{[\s\S]*?\})/;
const HARMONY_RE = /to=functions\.([A-Za-z_]\w*)\s*(\{[\s\S]*?\})/;

function textToolProtocol(tools) {
  const lines = [
    "Tool calling on this provider: when you need a tool, reply with exactly one fenced block and nothing after it:",
    "```tool",
    '{"name": "TOOL_NAME", "arguments": { ... }}',
    "```",
    "Then stop — the tool result arrives as the next message prefixed with [tool result]. Never invent results.",
    "Available tools:",
  ];
  for (const t of tools) {
    const f = t.function;
    const req = (f.parameters?.required || []).join(", ");
    const desc = String(f.description || "").split(".")[0];
    lines.push(`- ${f.name}${req ? ` (${req})` : ""}: ${desc}`);
  }
  return lines.join("\n");
}

// Returns { name, args } for a tool request found in the model's text,
// { invalid } when a request is present but unparseable, or null when the
// text contains no tool request at all.
function parseTextToolCall(content) {
  const text = String(content || "");
  if (!text) return null;
  const fenced = text.match(TOOL_MARKER_RE);
  if (fenced) {
    const parsed = tryParseLoose(fenced[1]);
    if (parsed?.name) return parsed;
    return { invalid: fenced[1].slice(0, 300) };
  }
  const calls = text.match(TOOL_CALLS_RE);
  if (calls) {
    let parsed = tryParseLoose(calls[1]);
    if (!parsed && Array.isArray(safeJson(calls[1]))) parsed = normalizeToolJson(safeJson(calls[1])[0]);
    if (parsed?.name) return parsed;
    return { invalid: calls[1].slice(0, 300) };
  }
  const harmony = text.match(HARMONY_RE);
  if (harmony) {
    const parsed = tryParseLoose(harmony[2]);
    if (parsed) return { ...parsed, name: parsed.name || harmony[1] };
    return { name: harmony[1], args: {} };
  }
  return null;
}

function tryParseLoose(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let parsed = safeJson(s);
  if (!parsed || typeof parsed !== "object") {
    const obj = s.match(/\{[\s\S]*\}/);
    parsed = obj ? safeJson(obj[0]) : null;
  }
  return normalizeToolJson(parsed);
}

function normalizeToolJson(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const name = String(parsed.name || parsed.tool || "").trim();
  if (!name) return null;
  return { name, args: parsed.arguments || parsed.args || parsed.parameters || {} };
}

// Mirror of providers.js safeJson's repair ladder (text-mode request parsing).
function safeJson(s) {
  for (const candidate of jsonRepairCandidates(String(s || ""))) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

function jsonRepairCandidates(s) {
  // A raw drive-letter path ("C:\U…" where the char after the backslash is not
  // a backslash) means the model emitted unescaped Windows separators — strict
  // parsing would then "succeed" with silent corruption (\t → TAB), so the
  // aggressive repair must run before any strict attempt for those strings.
  const rawWinPath = /["'][A-Za-z]:\\[^\\]/.test(s);
  const obj = s.match(/\{[\s\S]*\}/);
  const bases = obj && obj[0] !== s ? [s, obj[0]] : [s];
  const out = [];
  for (const base of bases) {
    if (rawWinPath) out.push(base.replace(/(?<!\\)\\(?!\\)/g, "\\\\"));
    if (!rawWinPath) out.push(base);
    if (obj && base === obj[0]) out.push(base);
    out.push(base.replace(/\\(?![\\/"bfnrtu])/g, "\\\\"));
    if (!rawWinPath) out.push(base.replace(/(?<!\\)\\(?!\\)/g, "\\\\"));
  }
  return out;
}

// Streams tool-request markup to the chat bubble otherwise; hold back a tail
// that might be the start of a marker so split chunks still match.
const TOOL_TEXT_MARKERS = ["```tool", "[TOOL_CALLS]", "to=functions."];
function makeToolDeltaFilter(onDelta) {
  let buf = "";
  let suppressed = false;
  const hold = Math.max(...TOOL_TEXT_MARKERS.map((m) => m.length)) - 1;
  return {
    push(chunk) {
      if (suppressed || typeof chunk !== "string" || !chunk) return;
      buf += chunk;
      const lower = buf.toLowerCase();
      let cut = -1;
      for (const marker of TOOL_TEXT_MARKERS) {
        const idx = lower.indexOf(marker.toLowerCase());
        if (idx >= 0 && (cut < 0 || idx < cut)) cut = idx;
      }
      if (cut >= 0) {
        suppressed = true;
        if (cut > 0) onDelta(buf.slice(0, cut));
        buf = "";
        return;
      }
      if (buf.length > hold) {
        onDelta(buf.slice(0, buf.length - hold));
        buf = buf.slice(buf.length - hold);
      }
    },
    flush() {
      if (suppressed || !buf) return;
      onDelta(buf);
      buf = "";
    },
  };
}

// Free gateways sometimes split one tool call across two slots: a known name
// with empty args next to a nameless call carrying the args. Reunite them.
function mergeSplitToolCalls(calls, knownNames) {
  const list = [...calls];
  const namedIdx = list.findIndex((c) => knownNames.has(String(c.name || "").trim()));
  const unnamedIdx = list.findIndex((c) => !String(c.name || "").trim());
  if (
    namedIdx >= 0 &&
    unnamedIdx >= 0 &&
    namedIdx !== unnamedIdx &&
    !Object.keys(list[namedIdx].args || {}).length &&
    Object.keys(list[unnamedIdx].args || {}).length
  ) {
    list[namedIdx] = { ...list[namedIdx], args: list[unnamedIdx].args };
    list.splice(unnamedIdx, 1);
  }
  return list;
}

/**
 * Run one agent turn.
 * events: { onStatus(text), onDelta(text), onToolCall(call), onToolResult(call, result), onApprovalRequest(call) -> Promise<bool> }
 */
async function runAgentTurn({ settings, history, approvalMode, botInstructions, botKnowledge, botSkills, mcpInstructions, memories, agentTools, signal, events, toolContext, extraToolDefs }) {
  const messages = [
    { role: "system", content: systemPrompt({ botInstructions, botKnowledge, botSkills, memories, mcpInstructions }) },
    ...history,
  ];
  const enabled = new Set(agentTools && agentTools.length ? agentTools : TOOL_DEFS.map((t) => t.function.name));
  const tools = [
    ...TOOL_DEFS.filter((t) => enabled.has(t.function.name)),
    ...(extraToolDefs || []),
  ];
  // sandbox execution target: the shell speaks POSIX bash inside the WSL box —
  // tell the model so it emits bash, not PowerShell
  if (toolContext?.executionTarget === "sandbox") {
    for (const t of tools) {
      if (t.function?.name === "run_command") {
        t.function = {
          ...t.function,
          description:
            "Run a shell command inside the agent's Linux sandbox (WSL) and return stdout/stderr (truncated to ~6000 chars). Use POSIX bash syntax (ls, cat, grep, apt, python3 — no PowerShell). Commands require user approval unless the approval mode allows them.",
        };
      }
    }
  }
  const knownNames = new Set(tools.map((t) => t.function.name));

  let finalText = "";
  let usage = null;
  let malformed = 0;
  let apiSeen = 0;
  let textInvalid = 0;
  let emptyReplies = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    events.onStatus("Working");
    let completion;
    try {
      completion = await providers.withFallback(settings, async (config) => {
        // text-mode: provider can't take API tools — describe them in prompt instead
        const textMode = config.supportsTools === false;
        const attemptMessages = textMode
          ? [...messages, { role: "system", content: textToolProtocol(tools) }]
          : messages;
        const filter = textMode ? makeToolDeltaFilter(events.onDelta) : null;
        const result = await providers.streamChat({
          config,
          messages: attemptMessages,
          tools,
          signal,
          onDelta: filter ? (c) => filter.push(c) : events.onDelta,
        });
        filter?.flush();
        result.textMode = textMode;
        return result;
      });
      if (completion.usage) usage = completion.usage;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      throw new Error(`Provider error: ${err.message}`);
    }

    if (completion.content) finalText = completion.content;
    completion.toolCalls = mergeSplitToolCalls(completion.toolCalls, knownNames);

    // Free gateways occasionally answer 200 with nothing at all; one silent
    // retry beats failing the turn.
    if (!completion.content && !completion.toolCalls.length) {
      emptyReplies++;
      if (emptyReplies <= 2) continue;
      return { text: finalText || "My model provider returned an empty response — try again in a moment.", stopped: true, usage };
    }
    emptyReplies = 0;

    // Build the pending call list. API tool calls first; in text-mode, a tool
    // request may instead arrive as markup inside the streamed content.
    const pending = completion.toolCalls.map((call) => ({ call, mode: "api" }));
    if (!completion.toolCalls.length && completion.textMode) {
      const parsed = parseTextToolCall(completion.content);
      if (parsed?.invalid) {
        pending.push({ invalid: parsed.invalid });
      } else if (parsed?.name) {
        if (!knownNames.has(parsed.name)) {
          pending.push({ invalid: `unknown tool "${parsed.name}"` });
        } else {
          pending.push({
            call: { id: `txt_${step}`, name: parsed.name, args: parsed.args || {} },
            mode: "text",
          });
        }
      }
    }
    if (!pending.length) {
      return { text: finalText || "(empty response)", usage };
    }

    // Some models (esp. small keyless ones) hallucinate tool calls: channel
    // markup in names (web_search<|channel|>commentary), JSON pasted into the
    // name, or split fragments. Repair what we can; reject the rest with a
    // corrective result so the model retries with a valid call.
    const repairCalls = pending.map((p) => {
      if (!p.call) return p;
      let name = String(p.call.name || "").trim();
      let args = p.call.args || {};
      if (!knownNames.has(name)) {
        // JSON pasted into the name field, possibly {name, arguments}
        if (name.startsWith("{")) {
          try {
            const parsed = JSON.parse(name);
            if (parsed && typeof parsed === "object") {
              name = String(parsed.name || parsed.tool || "").trim();
              if (parsed.arguments && (!args || Object.keys(args).length === 0)) args = parsed.arguments;
            }
          } catch {}
        }
        // channel markup or wrapper text around a real name
        if (!knownNames.has(name)) {
          for (const known of knownNames) {
            if (name.includes(known)) {
              name = known;
              break;
            }
          }
        }
      }
      return { ...p, call: { ...p.call, name, args } };
    });

    if (repairCalls.some((p) => p.mode === "api")) {
      messages.push({ role: "assistant", content: completion.content || "", tool_calls: completion.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: String(t.name || "unknown").slice(0, 120), arguments: JSON.stringify(t.args) } })) });
    } else {
      // text-mode feedback must work on providers that reject OpenAI tool roles
      messages.push({ role: "assistant", content: completion.content || "" });
    }

    for (const p of repairCalls) {
      let result;
      if (p.invalid) {
        if (p.mode === "api") malformed++;
        else textInvalid++;
        result = {
          ok: false,
          error: p.mode === "api"
            ? `Unknown tool "${p.call?.name || ""}". Available tools: ${[...knownNames].join(", ")}. Call one of them with proper JSON arguments.`
            : `I could not parse that tool request (${p.invalid}). Reply again with exactly one fenced block:\n` +
              '```tool\n{"name": "web_search", "arguments": {"query": "..."}}\n```',
        };
      } else {
        const call = p.call;
        events.onToolCall(call);
        events.onStatus(INTEG_STATUS[call.name] || STATUS_BY_TOOL[call.name] || "Working");
        try {
          // Section-A integration tools live in their own dispatcher; local
          // and MCP tools fall through to executeTool.
          result = toolContext?.tryIntegrationTool ? await toolContext.tryIntegrationTool(call) : null;
          if (result === null || result === undefined) {
            result = await executeTool(call, {
              signal,
              approvalMode,
              approve: events.onApprovalRequest,
              ...toolContext,
            });
          }
        } catch (err) {
          if (err?.name === "AbortError") throw err;
          result = { ok: false, error: String(err?.message || err) };
        }
        events.onToolResult(call, result);
      }
      if (p.mode === "api") {
        apiSeen++;
        messages.push({ role: "tool", tool_call_id: p.call?.id, content: JSON.stringify(result).slice(0, 12000) });
      } else {
        messages.push({
          role: "user",
          content: `[tool result for ${p.call ? p.call.name : "tool request"}]\n${JSON.stringify(result).slice(0, 12000)}`,
        });
      }
    }
    // a model stuck hallucinating malformed calls won't recover — stop early
    if ((malformed >= 3 && malformed === apiSeen) || textInvalid >= 3) {
      return {
        text:
          finalText ||
          "I couldn't complete that: my model provider kept sending malformed tool calls. Try a stronger provider (add a free Groq or OpenRouter key in Settings → General) or rephrase the request.",
        stopped: true,
        usage,
      };
    }
    // loop again — the model continues with tool results
  }
  return { text: finalText || "Stopped: too many tool steps.", stopped: true, usage };
}

module.exports = { runAgentTurn, parseTextToolCall, textToolProtocol, makeToolDeltaFilter };
