// Free API key providers — all OpenAI-compatible chat-completions endpoints
// with free keys / free tiers. The original app talks to api2.cursor.sh; this
// rebuild swaps in user-chosen free providers with automatic fallback.
//
// Free key sources:
//   OpenRouter  https://openrouter.ai/keys            (":free" models, rate-limited)
//   Groq        https://console.groq.com/keys         (generous free tier)
//   Google      https://aistudio.google.com/apikey    (Gemini free tier)
//   Cerebras    https://cloud.cerebras.ai             (free tier)
//   Mistral     https://console.mistral.ai/api-keys   (free experimental tier)
//   Pollinations https://pollinations.ai              (image gen, no key needed)

const PROVIDERS = [
  {
    id: "pollinations",
    name: "Pollinations (no key)",
    url: "https://text.pollinations.ai/openai",
    keyUrl: "https://pollinations.ai",
    models: [
      { id: "openai-fast", name: "GPT-OSS 20B (keyless)", note: "no key needed" },
    ],
    keyless: true,
    // openai-fast takes OpenAI tools over the streaming endpoint; a saved
    // retired model id (e.g. "mistral") self-heals to this via the 404 retry
    supportsTools: true,
  },
  {
    id: "groq",
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", note: "fast, general" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", note: "instant" },
      { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", note: "strong reasoning" },
      { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", note: "reasoning" },
      { id: "qwen/qwen3-32b", name: "Qwen 3 32B", note: "multilingual" },
    ],
    supportsTools: true,
    transcription: { url: "https://api.groq.com/openai/v1/audio/transcriptions", model: "whisper-large-v3-turbo" },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "deepseek/deepseek-chat-v3-0324:free", name: "DeepSeek V3", note: "free · strong" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", note: "free" },
      { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash", note: "free · fast" },
      { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder", note: "free · code" },
      { id: "mistralai/mistral-small-3.2-24b-instruct:free", name: "Mistral Small 3.2", note: "free" },
    ],
    supportsTools: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", note: "free tier" },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", note: "free tier" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", note: "free tier" },
    ],
    supportsTools: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    url: "https://api.cerebras.ai/v1/chat/completions",
    keyUrl: "https://cloud.cerebras.ai",
    models: [
      { id: "llama-3.3-70b", name: "Llama 3.3 70B", note: "very fast" },
      { id: "llama3.1-8b", name: "Llama 3.1 8B", note: "very fast" },
      { id: "qwen-3-32b", name: "Qwen 3 32B", note: "fast" },
    ],
    supportsTools: true,
  },
  {
    id: "mistral",
    name: "Mistral",
    url: "https://api.mistral.ai/v1/chat/completions",
    keyUrl: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-small-latest", name: "Mistral Small", note: "free tier" },
      { id: "open-mistral-nemo", name: "Mistral Nemo", note: "free tier" },
    ],
    supportsTools: true,
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    url: "",
    keyUrl: "",
    models: [],
    supportsTools: true,
  },
];

function providerById(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

// Derive the /models listing endpoint from a chat-completions URL
function modelsUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/chat\/completions\/?$/, "") + "/models";
}

// Live model discovery: GET /models with the saved key (OpenAI-compatible
// shape { data: [{ id }] }; tolerate { models: [{ name | id }] }).
async function fetchModels({ providerId, apiKey, baseUrl }) {
  const provider = providerById(providerId);
  if (!provider) throw new Error("unknown provider");
  if (provider.keyless) throw new Error("keyless provider uses its fixed model list");
  const url = modelsUrl(baseUrl || provider.url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`models HTTP ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json) ? json : json.data || json.models || [];
  const ids = rows
    .map((m) => (typeof m === "string" ? m : m.id || m.name || m.model))
    .filter((id) => typeof id === "string" && id.length)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 400);
  return ids;
}

// settings: { providers: { [id]: { apiKey, baseUrl?, model } }, activeProvider, activeModel }
function activeConfig(settings) {
  const pid = settings.activeProvider || "";
  const creds = (settings.providers || {})[pid] || {};
  const provider = providerById(pid);
  if (!provider) return null;
  const apiKey = creds.apiKey || (provider.keyless ? "free" : "");
  if (!apiKey) return null;
  return {
    providerId: pid,
    baseUrl: creds.baseUrl || provider.url,
    apiKey,
    model: creds.model || provider.models[0]?.id || "",
    fallbackModel: provider.models[0]?.id || "",
    supportsTools: provider.supportsTools !== false,
  };
}

function orderedConfigs(settings) {
  // Active provider first, then every other configured provider as fallback.
  const out = [];
  const active = activeConfig(settings);
  if (active) out.push(active);
  for (const pid of Object.keys(settings.providers || {})) {
    if (active && pid === active.providerId) continue;
    const c = activeConfig({ ...settings, activeProvider: pid });
    if (c) out.push(c);
  }
  return out;
}

// Abortable sleep: resolves after ms, rejects with AbortError if signal fires.
function sleepWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

async function streamChat({ config, messages, tools, signal, onDelta, onDone }) {
  const body = {
    model: config.model,
    messages,
    stream: true,
  };
  if (tools && tools.length && config.supportsTools !== false) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const doFetch = () =>
    fetch(config.baseUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://github.com/emberling",
        "X-Title": "Emberling",
      },
      body: JSON.stringify(body),
    });
  let res = await doFetch();
  // self-heal: free providers rotate their model rosters — when a saved model
  // id disappears (404/400), retry once with the provider's default model
  if ((res.status === 404 || res.status === 400) && config.model !== config.fallbackModel) {
    const fallbackModel = config.fallbackModel || "";
    if (fallbackModel) {
      body.model = fallbackModel;
      res = await doFetch();
    }
  }
  // keyless free tiers throttle to ~1 reply per 30s — wait out the stated
  // backoff and retry once so multi-step tool turns can complete
  if (res.status === 402) {
    const text = await res.text().catch(() => "");
    const wait = Number((text.match(/Retry after (\d+)\s*s/i) || [])[1] || 0);
    if (!wait || wait > 90) throw new Error(`${config.providerId} HTTP 402: ${text.slice(0, 400)}`);
    await sleepWithSignal((wait + 2) * 1000, signal);
    res = await doFetch();
  }
  // "previous request is still running" (RATE_LIMITED): the prior connection
  // hasn't fully unwound yet (edit-and-resend, concurrent chats) — brief
  // backoff and retry before failing over
  if (res.status === 429) {
    const text = await res.text().catch(() => "");
    if (/RATE_LIMITED|still running|per IP/i.test(text)) {
      for (const waitMs of [4000, 9000]) {
        await sleepWithSignal(waitMs, signal);
        res = await doFetch();
        if (res.status !== 429) break;
      }
      if (res.status === 429) {
        const again = await res.text().catch(() => "");
        throw new Error(`${config.providerId} HTTP 429: ${again.slice(0, 300)}`);
      }
    } else {
      throw new Error(`${config.providerId} HTTP 429: ${text.slice(0, 400)}`);
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${config.providerId} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const final = { content: "", toolCalls: [], finishReason: null, usage: null };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const partialById = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let evt;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = evt.choices?.[0];
      if (!choice) continue;
      if (evt.usage) final.usage = evt.usage;

      const delta = choice.delta || {};
      if (typeof delta.content === "string" && delta.content.length) {
        final.content += delta.content;
        onDelta?.(delta.content);
      }
      // normalized tool_call accumulation across providers
      for (const tc of delta.tool_calls || []) {
        const id = tc.id ?? `call_${tc.index}`;
        let slot = partialById.get(id);
        if (!slot) {
          slot = { id, name: "", args: "" };
          partialById.set(id, slot);
        }
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
      if (choice.finish_reason) final.finishReason = choice.finish_reason;
    }
  }

  final.toolCalls = [...partialById.values()].map((t) => ({
    id: t.id,
    name: t.name,
    args: safeJson(t.args),
  }));
  onDone?.(final);
  return final;
}

// Models routinely emit tool args with raw Windows paths ("C:\Users\…") whose
// single backslashes are invalid JSON escapes (or valid-but-wrong ones like
// \t in "\thaku"). Strict parse first, then progressively looser repairs; the
// aggressive pass treats every isolated backslash as a literal path separator.
function safeJson(s) {
  if (typeof s !== "string" || !s.trim()) return {};
  for (const candidate of jsonRepairCandidates(s)) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return { _raw: s };
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

// Multi-provider attempt with fallback. `attempt(i, config)` does the real call.
async function withFallback(settings, fn) {
  const configs = orderedConfigs(settings);
  if (!configs.length) {
    throw new Error(
      "No API provider configured. Open Settings → General, add a free API key (Groq, OpenRouter, Google Gemini, Cerebras or Mistral), then try again."
    );
  }
  let lastErr = null;
  for (const config of configs) {
    try {
      return await fn(config, configs.indexOf(config));
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastErr = err;
      console.warn(`provider ${config.providerId} failed:`, err.message);
    }
  }
  throw lastErr || new Error("All providers failed");
}

async function transcribe({ settings, filePath, mimeType }) {
  const pid = settings.activeProvider;
  const provider = providerById(pid);
  if (!provider?.transcription) {
    // fall back to any configured Groq key
    const groqKey = settings.providers?.groq?.apiKey;
    if (!groqKey) throw new Error("Voice transcription needs a free Groq API key (Settings → General).");
    return transcribeWith("https://api.groq.com/openai/v1/audio/transcriptions", groqKey, "whisper-large-v3-turbo", filePath, mimeType);
  }
  const key = settings.providers?.[pid]?.apiKey;
  return transcribeWith(provider.transcription.url, key, provider.transcription.model, filePath, mimeType);
}

async function transcribeWith(url, key, model, filePath, mimeType) {
  const fs = require("node:fs");
  const blob = new Blob([fs.readFileSync(filePath)], { type: mimeType || "audio/webm" });
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  form.append("model", model);
  form.append("response_format", "json");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcription HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.text || "";
}

module.exports = { PROVIDERS, providerById, activeConfig, orderedConfigs, streamChat, withFallback, transcribe, fetchModels, modelsUrl, safeJson };
