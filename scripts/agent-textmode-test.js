// Regression test: text-mode tool protocol for providers without API tool
// support (Pollinations keyless), plus the unchanged API-tool path.
// Runs agent.js against a scripted fake provider with real web_search behind it.
const assert = require("node:assert");
const providers = require("../electron/providers");
const agent = require("../electron/agent");

const FAKE_CONFIG = { providerId: "fake-keyless", baseUrl: "http://localhost:9", apiKey: "x", model: "fake", fallbackModel: "fake", supportsTools: false };
const API_CONFIG = { ...FAKE_CONFIG, providerId: "fake-api", supportsTools: true };

let scripted = []; // responses consumed in order
let seenMessages = [];
let streamed = "";

providers.withFallback = async (_settings, fn) => fn(FAKE_CONFIG);
providers.streamChat = async ({ messages, onDelta }) => {
  seenMessages = messages.map((m) => ({ role: m.role, content: String(m.content || "") }));
  const res = scripted.shift();
  if (!res) throw new Error("script exhausted");
  if (res.delta) onDelta?.(res.delta);
  return { content: res.content || "", toolCalls: res.toolCalls || [], finishReason: res.finish || "stop", usage: null };
};

const SETTINGS = { activeProvider: "fake", providers: {} };
const EVENTS = {
  onStatus: () => {},
  onDelta: (d) => { streamed += d; },
  onToolCall: () => {},
  onToolResult: () => {},
  onApprovalRequest: () => Promise.resolve(false),
};

async function turn(script, opts = {}) {
  scripted = script;
  seenMessages = [];
  streamed = "";
  return agent.runAgentTurn({
    settings: opts.apiMode ? { ...SETTINGS } : SETTINGS,
    history: [{ role: "user", content: "search the web for test" }],
    approvalMode: "auto",
    agentTools: ["web_search", "web_fetch"],
    signal: undefined,
    events: EVENTS,
    toolContext: {},
  });
}

async function main() {
  // 1. fenced ```tool block round-trip
  let r = await turn([
    { delta: "Checking that.\n", content: "Checking that.\n```tool\n{\"name\": \"web_search\", \"arguments\": {\"query\": \"openai news\"}}\n```" },
    { content: "Final answer based on results." },
  ]);
  assert.strictEqual(r.text, "Final answer based on results.");
  assert.ok(!streamed.includes("```tool"), "tool block must not stream into the bubble, got: " + JSON.stringify(streamed));
  assert.ok(streamed.includes("Checking that."), "pre-block prose should stream");
  const feedback = seenMessages.find((m) => m.role === "user" && m.content.startsWith("[tool result for web_search]"));
  assert.ok(feedback, "tool result must be fed back as a user message");
  // protocol prompt is appended per attempt; verify it was requested at least once
  assert.ok(seenMessages.some((m) => m.content.includes("Available tools:") && m.content.includes("web_search")), "protocol prompt must describe tools");

  // 2. GPT-OSS harmony leak: to=functions.NAME {json}
  r = await turn([
    { content: "to=functions.web_search {\"query\": \"harmony test\"}" },
    { content: "done harmony" },
  ]);
  assert.strictEqual(r.text, "done harmony");
  assert.ok(seenMessages.some((m) => m.content.includes("[tool result for web_search]")), "harmony call must execute web_search");

  // 3. Mistral [TOOL_CALLS] leak
  r = await turn([
    { content: "[TOOL_CALLS] [{\"name\": \"web_search\", \"arguments\": {\"query\": \"mistral test\"}}]" },
    { content: "done mistral" },
  ]);
  assert.strictEqual(r.text, "done mistral");
  assert.ok(seenMessages.some((m) => m.content.includes("[tool result for web_search]")), "[TOOL_CALLS] must execute web_search");

  // 4. invalid fenced block → corrective feedback → model recovers
  r = await turn([
    { content: "```tool\nnot json at all\n```" },
    { content: "```tool\n{\"name\": \"web_search\", \"arguments\": {\"query\": \"retry test\"}}\n```" },
    { content: "recovered" },
  ]);
  assert.strictEqual(r.text, "recovered");
  assert.ok(seenMessages.some((m) => m.content.includes("I could not parse that tool request")), "corrective feedback must be sent");

  // 5. API-tool path unchanged: role:"tool" feedback, no text protocol
  providers.withFallback = async (_settings, fn) => fn(API_CONFIG);
  r = await turn(
    [
      { toolCalls: [{ id: "c1", name: "web_search", args: { query: "api path" } }] },
      { content: "api final" },
    ],
    { apiMode: true }
  );
  assert.strictEqual(r.text, "api final");
  assert.ok(seenMessages.some((m) => m.role === "tool"), "API path must use role:tool feedback");
  assert.ok(!seenMessages.some((m) => m.content.includes("Available tools:")), "API path must not inject text protocol");

  // 6. split gateway calls: name+empty args beside nameless+args → one real call
  r = await turn(
    [
      { toolCalls: [{ id: "s1", name: "web_search", args: {} }, { id: "s2", name: "", args: { query: "split call test" } }] },
      { content: "split final" },
    ],
    { apiMode: true }
  );
  assert.strictEqual(r.text, "split final");
  const toolMsgs = seenMessages.filter((m) => m.role === "tool");
  assert.strictEqual(toolMsgs.length, 1, `split calls must merge into ONE executed call, got ${toolMsgs.length}`);
  assert.ok(!toolMsgs[0].content.includes("needs a non-empty"), "merged call must carry the query args");

  console.log("ALL TEXT-MODE TESTS PASSED");
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message);
  process.exit(1);
});
