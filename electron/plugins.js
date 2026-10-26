// Plugins system (Block B11) — a local registry of capability plugins that
// inject agent tools. Ships with keyless built-ins (weather, places,
// currency); users can install extra plugins from manifest JSON files.
// Manifest shape: { name, id?, description?, tools: [{ name, description, parameters, run: "fetch:url-template" | handler-id }] }
// For safety, installed manifests can only declare fetch-tool runs.
const fsp = require("node:fs/promises");
const path = require("node:path");

const BUILT_INS = [
  {
    id: "weather",
    name: "Weather",
    description: "Current conditions + forecast for any city (wttr.in, keyless).",
    builtin: true,
    enabled: true,
    tools: [
      {
        name: "weather",
        description: "Get current weather and a 3-day forecast for a place.",
        parameters: { type: "object", properties: { place: { type: "string", description: "City, e.g. 'Berlin' or 'Tokyo'" } }, required: ["place"] },
        run: "weather",
      },
    ],
  },
  {
    id: "places",
    name: "Places",
    description: "Geocode and discover places via OpenStreetMap Nominatim (keyless).",
    builtin: true,
    enabled: true,
    tools: [
      {
        name: "places_search",
        description: "Search for a place by name; returns matches with coordinates and address info.",
        parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
        run: "places",
      },
    ],
  },
  {
    id: "currency",
    name: "Currency",
    description: "Exchange rates via exchangerate.host / open.er-api.com (keyless).",
    builtin: true,
    enabled: true,
    tools: [
      {
        name: "currency_convert",
        description: "Convert an amount between currencies at current rates.",
        parameters: { type: "object", properties: { from: { type: "string", description: "e.g. USD" }, to: { type: "string", description: "e.g. EUR" }, amount: { type: "number" } }, required: ["from", "to"] },
        run: "currency",
      },
    ],
  },
];

function registry(store) {
  const list = store.load("plugins", []);
  // ensure built-ins exist exactly once
  for (const b of BUILT_INS) {
    if (!list.find((p) => p.id === b.id)) list.push({ ...b, installedAt: Date.now() });
  }
  return list;
}

function saveRegistry(store, list) {
  store.update("plugins", () => list);
}

async function runBuiltin(run, args) {
  if (run === "weather") {
    const url = new URL("https://wttr.in/" + encodeURIComponent(String(args.place || "")));
    url.searchParams.set("format", "j1");
    const res = await fetch(url, { headers: { "User-Agent": "Emberling" } });
    if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
    const j = await res.json();
    const cur = j.current_condition?.[0] || {};
    const days = (j.weather || []).slice(0, 3).map((d) => ({ date: d.date, maxC: d.maxtempC, minC: d.mintempC, desc: d.hourly?.[4]?.weatherDesc?.[0]?.value }));
    return { ok: true, place: (j.nearest_area || [])[0]?.areaName?.[0]?.value, tempC: cur.temp_C, feelsC: cur.FeelsLikeC, desc: cur.weatherDesc?.[0]?.value, humidity: cur.humidity, windKmph: cur.windspeedKmph, days };
  }
  if (run === "places") {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", String(args.query || ""));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(Math.min(10, Number(args.limit) || 5)));
    const res = await fetch(url, { headers: { "User-Agent": "Emberling/1.0" } });
    if (!res.ok) throw new Error(`places HTTP ${res.status}`);
    const rows = await res.json();
    return { ok: true, results: rows.map((r) => ({ name: r.display_name, type: r.type, lat: r.lat, lon: r.lon })) };
  }
  if (run === "currency") {
    const from = String(args.from || "USD").toUpperCase();
    const to = String(args.to || "EUR").toUpperCase();
    const amount = Number(args.amount) || 1;
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
    if (!res.ok) throw new Error(`currency HTTP ${res.status}`);
    const j = await res.json();
    const rate = j.rates?.[to];
    if (!rate) throw new Error(`unknown target currency ${to}`);
    return { ok: true, from, to, amount, rate, result: Number((amount * rate).toFixed(4)), updated: j.time_last_update_utc };
  }
  throw new Error(`unknown builtin run: ${run}`);
}

async function runFetchTool(tool, args) {
  // fetch-tool: manifest declares run: { url, method?, headers?, bodyTemplate? }
  // with {{arg}} placeholders — args are injected via encodeURIComponent.
  const run = tool.run;
  if (!run || typeof run !== "object" || !run.url) throw new Error("plugin tool has no runnable definition");
  const fill = (s) =>
    String(s || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => encodeURIComponent(String(args[k] ?? "")));
  const url = fill(run.url);
  if (!/^https?:\/\//i.test(url)) throw new Error("plugin fetch url must be http(s)");
  const res = await fetch(url, {
    method: run.method || "GET",
    headers: run.headers ? Object.fromEntries(Object.entries(run.headers).map(([k, v]) => [k, fill(v)])) : undefined,
    body: run.bodyTemplate ? fill(run.bodyTemplate) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`plugin HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: true, data: text.slice(0, 12000) };
  }
}

async function executePluginTool(call, store) {
  const list = registry(store);
  for (const p of list) {
    if (!p.enabled) continue;
    const tool = (p.tools || []).find((t) => t.name === call.name);
    if (!tool) continue;
    try {
      if (typeof tool.run === "string") return await runBuiltin(tool.run, call.args);
      return await runFetchTool(tool, call.args);
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      return { ok: false, error: String(err?.message || err) };
    }
  }
  return null; // not a plugin tool (or plugin disabled)
}

function agentToolDefs(store) {
  const list = registry(store).filter((p) => p.enabled);
  const defs = [];
  for (const p of list) {
    for (const t of p.tools || []) {
      defs.push({
        type: "function",
        function: {
          name: t.name,
          description: `[${p.name}] ${t.description}`.slice(0, 300),
          parameters: t.parameters || { type: "object", properties: {} },
        },
        _plugin: p.id,
      });
    }
  }
  return defs;
}

async function installFromManifest(store, manifest) {
  if (!manifest || typeof manifest !== "object" || !manifest.name || !Array.isArray(manifest.tools)) {
    throw new Error("manifest needs name + tools[]");
  }
  if (manifest.tools.length > 20) throw new Error("too many tools (max 20)");
  for (const t of manifest.tools) {
    if (!t.name || !/^[a-z0-9_]{3,40}$/.test(t.name)) throw new Error("tool names must be snake_case, 3-40 chars");
    if (typeof t.run === "object") {
      if (!/^https?:\/\//i.test(t.run?.url || "")) throw new Error("fetch-tool urls must be http(s)");
    }
  }
  const list = registry(store);
  const id = manifest.id || manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const entry = {
    id,
    name: String(manifest.name).slice(0, 40),
    description: String(manifest.description || "").slice(0, 200),
    builtin: false,
    enabled: true,
    installedAt: Date.now(),
    tools: manifest.tools.slice(0, 20),
  };
  const next = [...list.filter((p) => p.id !== id), entry];
  saveRegistry(store, next);
  return { ok: true, id, tools: entry.tools.map((t) => t.name) };
}

async function installFromFile(store, filePath) {
  const text = await fsp.readFile(filePath, "utf8");
  return installFromManifest(store, JSON.parse(text));
}

function uninstall(store, id) {
  saveRegistry(store, registry(store).filter((p) => p.id !== id));
}

function setStatus(store, id, enabled) {
  saveRegistry(store, registry(store).map((p) => (p.id === id ? { ...p, enabled } : p)));
}

module.exports = { registry, agentToolDefs, executePluginTool, installFromManifest, installFromFile, uninstall, setStatus, BUILT_INS };
