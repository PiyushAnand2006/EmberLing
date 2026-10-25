// Verify lenient JSON recovery (invalid Windows-path escapes) + media tools.
const assert = require("node:assert");
const { safeJson } = require("../electron/providers");
const { webFetch, generatePhoto, generateVideo } = require("../electron/web-tools");

// 1. raw Windows paths with invalid escapes (\U, \T)
let a = safeJson('{"path":"C:\\Users\\thaku\\Temp\\ember-lenient.txt","content":"lenient test"}');
assert.strictEqual(a.path, "C:\\Users\\thaku\\Temp\\ember-lenient.txt", "invalid escapes recover to real path, got " + JSON.stringify(a));

// 2. \t inside a path segment must NOT become a tab
a = safeJson('{"path":"C:\\thaku\\file.txt"}');
assert.strictEqual(a.path, "C:\\thaku\\file.txt", "\\t in a path must stay backslash-t, got " + JSON.stringify(a));

// 3. already-valid JSON (properly escaped paths) parses unchanged
a = safeJson('{"path":"C:\\\\Users\\\\ok\\\\f.txt","note":"line1\\nline2"}');
assert.strictEqual(a.path, "C:\\Users\\ok\\f.txt");
assert.strictEqual(a.note, "line1\nline2");

// 4. prose-wrapped JSON
a = safeJson('Sure! Here are the args: {"query": "latest node version"} hope that helps');
assert.strictEqual(a.query, "latest node version");

// 5. genuinely unparseable → {_raw}
a = safeJson('{"path": ');
assert.ok(a._raw !== undefined);

// 6. media tools (keyless Pollinations image endpoint — upstream throttles
//    bursts per IP, so a persistent 402 here counts as quota, not a code bug)
const QUOTA_RE = /HTTP (402|429)/;
(async () => {
  try {
    const photo = await generatePhoto("a tiny orange robot mascot, flat vector, dark background");
    assert.ok(photo.url && photo.url.startsWith("https://image.pollinations.ai/"), "photo url");
    console.log("generate_photo OK:", photo.url.slice(0, 80) + "…");
  } catch (e) {
    if (QUOTA_RE.test(e.message)) console.log("generate_photo SKIPPED (upstream image quota):", e.message);
    else throw e;
  }

  await new Promise((r) => setTimeout(r, 20000));
  try {
    const vid = await generateVideo("a small rocket lifting off, cartoon style", 4);
    assert.ok(vid.frames.length === 4 && vid.embed.includes("```clip"), "video frames + clip embed");
    console.log("generate_video OK:", vid.frames.length, "frames");
  } catch (e) {
    if (QUOTA_RE.test(e.message)) console.log("generate_video SKIPPED (upstream image quota):", e.message);
    else throw e;
  }

  const page = await webFetch("https://example.com");
  assert.ok(page.includes("Example Domain"));
  console.log("webFetch OK");
  console.log("ALL MEDIA/LENIENT TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
