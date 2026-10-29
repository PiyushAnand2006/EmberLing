// Live test: crash marker cleared before launch, clean browser start.
const browser = require("../electron/browser.js");
const fs = require("node:fs");

(async () => {
  const prefsFile = "C:\\Users\\Public\\emberling-browser-profile\\Default\\Preferences";
  const prefs = JSON.parse(fs.readFileSync(prefsFile, "utf8"));
  prefs.profile = prefs.profile || {};
  prefs.profile.exit_type = "Crashed";
  prefs.profile.exited_cleanly = false;
  fs.writeFileSync(prefsFile, JSON.stringify(prefs));
  console.log("set exit_type=Crashed");

  const s = await browser.open("https://example.com");
  console.log("opened:", s.ok, s.url);

  const after = JSON.parse(fs.readFileSync(prefsFile, "utf8"));
  console.log("exit_type after launch:", after.profile?.exit_type);

  await browser.close(true);
  console.log("CRASH-MARKER TEST PASSED");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
