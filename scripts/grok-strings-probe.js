// Extract the bot-screen + routines UI strings from the original Grok Bot's
// compiled catalog (REA evidence). Reads exactly one fixed catalog file.
const s = require("fs").readFileSync("C:\\Users\\thaku\\AppData\\Local\\Temp\\rea-grok-installed\\dist\\renderer\\assets\\index.eager-app-D25OYGQG.js", "utf8");
const probes = ["’s screen", "'s screen", "s screen`", "screenTitle", "screenLabel", "Acting on the screen", "Taking over", "screen for", "Live screen", "Screen "];
for (const n of probes) {
  let i = -1;
  const at = [];
  while ((i = s.indexOf(n, i + 1)) >= 0 && at.length < 4) at.push(i);
  if (at.length) {
    console.log(JSON.stringify(n), "->", at.join(","));
    const k = at[0];
    console.log("   ctx:", s.slice(k - 80, k + 140).replace(/\n/g, " ").slice(0, 210));
  }
}
