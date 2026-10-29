// Web tools module — keyless search and page fetching.
// Search uses DuckDuckGo's lite endpoint (fallback: html endpoint); fetching
// is restricted to http(s) and returns readable text. Outbound requests only
// target public hosts: localhost, loopback, private and reserved ranges are
// rejected (hostname check + DNS resolution check) before any fetch.

const dns = require("node:dns/promises");
const net = require("node:net");

function truncate(s, n) {
  if (typeof s !== "string") s = String(s);
  return s.length > n ? s.slice(0, n) + `\n… [truncated ${s.length - n} chars]` : s;
}

// SSRF guard: http/https, no credentials, host must resolve to a public IP.
async function assertPublicHttpUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    throw new Error("invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http(s) URLs are allowed");
  if (u.username || u.password) throw new Error("credentials in URLs are not allowed");
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("local hostnames are not allowed");
  }
  if (net.isIP(host)) {
    assertPublicIp(host);
  } else {
    let addrs = [];
    try {
      addrs = await dns.lookup(host, { all: true });
    } catch {
      throw new Error("host does not resolve");
    }
    if (!addrs.length) throw new Error("host does not resolve");
    for (const a of addrs) assertPublicIp(a.address);
  }
  return u;
}

function assertPublicIp(ip) {
  const v = ip.version || (net.isIPv6(ip) ? 6 : 4);
  const range = new net.BlockList();
  range.addSubnet("127.0.0.0", 8, "ipv4");
  range.addSubnet("10.0.0.0", 8, "ipv4");
  range.addSubnet("172.16.0.0", 12, "ipv4");
  range.addSubnet("192.168.0.0", 16, "ipv4");
  range.addSubnet("169.254.0.0", 16, "ipv4");
  range.addSubnet("0.0.0.0", 8, "ipv4");
  range.addSubnet("100.64.0.0", 10, "ipv4");
  range.addSubnet("::1", 128, "ipv6");
  range.addSubnet("fe80::", 10, "ipv6");
  range.addSubnet("fc00::", 7, "ipv6");
  if (range.check(ip, v === 6 ? "ipv6" : "ipv4")) {
    throw new Error("requests to private, loopback or reserved addresses are not allowed");
  }
}

function stripHtml(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
  return text.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// result links carry the target inside the uddg= redirect param; class quoting
// varies between the lite and html endpoints (single vs double quotes)
const LINK_RE = /<a[^>]+href="(?:https?:)?\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const ALT_LINK_RE = /<a[^>]+class=['"][^'"]*result__a[^'"]*['"][^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const SNIPPET_RE = /<(?:td|a)[^>]*class=['"][^'"]*result(?:-snippet|__snippet)[^'"]*['"][^>]*>([\s\S]*?)<\/(?:td|a)>/g;

/**
 * Search the web and return up to 8 results: { title, url, snippet }.
 * @param {string} query - plain search phrase
 */
async function webSearch(query) {
  // lite endpoint first (simpler markup, lighter bot walls), html as fallback,
  // then the keyless JSON instant-answer API when the page endpoints bot-wall
  const endpoints = [
    { base: "https://lite.duckduckgo.com/lite/", param: "q" },
    { base: "https://html.duckduckgo.com/html/", param: "q" },
  ];
  let lastErr = null;
  for (const ep of endpoints) {
    try {
      const url = new URL(ep.base);
      url.searchParams.set(ep.param, String(query));
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`search HTTP ${res.status}`);
      const html = await res.text();
      const snips = [...html.matchAll(SNIPPET_RE)].map((m) => stripHtml(m[1]));
      const found = [...html.matchAll(LINK_RE)];
      const alt = found.length ? [] : [...html.matchAll(ALT_LINK_RE)];
      const results = [];
      let i = 0;
      const emit = (rawHref, title) => {
        if (results.length >= 8) return;
        // LINK_RE captures the encoded target directly; ALT_LINK_RE captures a
        // full redirect href whose uddg= param holds the encoded target
        const uddg = rawHref.match(/[?&]uddg=([^&]+)/);
        const target = decodeURIComponent(uddg ? uddg[1] : rawHref);
        results.push({ title: stripHtml(title), url: target, snippet: snips[i] || "" });
        i++;
      };
      for (const m of found) emit(m[1], m[2]);
      for (const m of alt) emit(m[1], m[2]);
      if (results.length) return results;
      lastErr = new Error("no results parsed (possible bot wall)");
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    const jsonResults = await ddgInstantAnswers(query);
    if (jsonResults.length) return jsonResults;
  } catch (err) {
    lastErr = lastErr || err;
  }
  if (lastErr) {
    throw new Error(
      `${lastErr.message}. Search endpoints are rate-limiting this network — try again shortly, or use web_fetch on a likely URL (e.g. wikipedia.org, the topic's official site) instead.`
    );
  }
  throw new Error("search failed");
}

// Keyless JSON API — no bot wall, but thinner coverage: the instant answer
// abstract plus related topics, mapped to the same { title, url, snippet } shape.
async function ddgInstantAnswers(query) {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", String(query));
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`instant-answer API HTTP ${res.status}`);
  const json = await res.json();
  const out = [];
  const push = (title, u, snippet) => {
    if (!u || out.length >= 8) return;
    out.push({ title: String(title || u), url: String(u), snippet: String(snippet || "").slice(0, 400) });
  };
  if (json.AbstractText) push(json.Heading, json.AbstractURL, json.AbstractText);
  const walk = (topics) => {
    for (const t of topics || []) {
      if (t.Topics) walk(t.Topics);
      else if (t.FirstURL) push(t.Text?.split(" - ")[0], t.FirstURL, t.Text);
    }
  };
  walk(json.RelatedTopics);
  return out;
}

/**
 * Fetch a page and return readable text (HTML stripped, truncated).
 * @param {string} rawUrl - the page address, must be http(s)
 */
async function webFetch(rawUrl) {
  const parsed = await assertPublicHttpUrl(rawUrl);
  const res = await fetch(parsed, {
    headers: { ...BROWSER_HEADERS, Accept: "text/html,application/json,text/plain,*/*" },
    redirect: "follow",
  });
  const ct = res.headers.get("content-type") || "";
  const body = await res.text();
  if (ct.includes("json")) return truncate(body, 12000);
  return truncate(stripHtml(body), 12000);
}

/**
 * Fetch a URL's public link-preview metadata (Open Graph / Twitter / <title>).
 * @param {string} rawUrl - the page address
 */
async function linkPreview(rawUrl) {
  const parsed = await assertPublicHttpUrl(rawUrl);
  const res = await fetch(parsed, {
    headers: { ...BROWSER_HEADERS, Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("html")) return { ok: true, url: parsed.toString(), title: "", description: "", image: "", note: "content-type: " + ct.split(";")[0] };
  const html = (await res.text()).slice(0, 500000);
  const meta = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
    const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    const m = html.match(re) || html.match(alt);
    return m ? m[1].trim() : "";
  };
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = meta("og:title") || meta("twitter:title") || stripHtml(titleMatch ? titleMatch[1] : "").slice(0, 200);
  const description = meta("og:description") || meta("twitter:description") || meta("description");
  const image = meta("og:image") || meta("twitter:image");
  const siteName = meta("og:site_name");
  return { ok: true, url: parsed.toString(), title, description: description.slice(0, 400), image, siteName };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pollinations image generation is flaky under load (transient 5xx) and
// throttles bursts (402/429); probe with spaced retries before giving up.
async function probeImage(url) {
  let lastErr = null;
  for (let i = 0; i < 4; i++) {
    try {
      const probe = await fetch(url, { method: "GET", headers: { Range: "bytes=0-64" } });
      if (probe.ok || probe.status === 206) return;
      lastErr = new Error(`image endpoint HTTP ${probe.status}`);
      if (probe.status === 402 || probe.status === 429) {
        const text = await probe.text().catch(() => "");
        const wait = Number(probe.headers.get("retry-after") || (text.match(/Retry after (\d+)\s*s/i) || [])[1] || 0);
        await sleep(Math.min(wait * 1000 + 3000, 45000));
        continue;
      }
    } catch (err) {
      lastErr = err;
    }
    await sleep(2000 * (i + 1));
  }
  throw lastErr || new Error("image endpoint unreachable");
}

/**
 * Generate a photo with the free keyless Pollinations endpoint.
 * @param {string} prompt - image description
 */
async function generatePhoto(prompt) {
  // image + text share Pollinations' one-request-per-IP Classic limit — take
  // the same slot the chat streams use so the two can't collide
  const { withKeylessSlot } = require("./providers");
  return withKeylessSlot("pollinations", async () => {
    const seedBytes = new Uint8Array(4);
    crypto.getRandomValues(seedBytes);
    const seed = new DataView(seedBytes.buffer).getUint32(0);
    const url = new URL("https://image.pollinations.ai/prompt/" + encodeURIComponent(String(prompt)));
    url.searchParams.set("width", "1024");
    url.searchParams.set("height", "1024");
    url.searchParams.set("seed", String(seed));
    url.searchParams.set("nologo", "true");
    await probeImage(url);
    return { url: url.toString(), prompt: String(prompt) };
  });
}

/**
 * Generate a short animated clip: a seeded frame sequence from the keyless
 * Pollinations endpoint. Returns frame URLs for the chat clip player.
 * @param {string} prompt - description of the motion/scene
 * @param {number} frames - 3..8 frames
 */
async function generateVideo(prompt, frames = 5) {
  const seedBytes = new Uint8Array(4);
  crypto.getRandomValues(seedBytes);
  const baseSeed = new DataView(seedBytes.buffer).getUint32(0);
  const urls = [];
  for (let i = 0; i < frames; i++) {
    const url = new URL("https://image.pollinations.ai/prompt/" + encodeURIComponent(String(prompt)));
    url.searchParams.set("width", "768");
    url.searchParams.set("height", "432");
    url.searchParams.set("seed", String(baseSeed + i * 7));
    url.searchParams.set("nologo", "true");
    urls.push(url.toString());
  }
  // probe first frame so failures surface now
  await probeImage(urls[0]);
  return {
    ok: true,
    frames: urls,
    embed: `\n\`\`\`clip\n${JSON.stringify({ prompt: String(prompt), frames: urls })}\n\`\`\`\n(embedded below)\n`,
  };
}

module.exports = { webSearch, webFetch, linkPreview, generatePhoto, generateVideo, stripHtml, truncate, assertPublicHttpUrl };
