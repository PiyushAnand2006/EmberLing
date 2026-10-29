// REA: group-chat orchestration strings from the installed original's catalog.
const s = require("fs").readFileSync("C:\\Users\\thaku\\AppData\\Local\\Temp\\rea-grok-installed\\dist\\renderer\\assets\\index.eager-app-D25OYGQG.js", "utf8");
const probes = [
  "Group chats spend more", "multiple Bots process", "Add Rooms", "Rooms",
  "Bots to add", "Add Bots", "process each message", "every Bot", "each Bot",
  "In this exchange", "exchange", "member turn", "respond to this message",
  "Which Bots", "Pick Bots", "choose Bots", "Add bots", "Invite",
];
for (const n of probes) {
  let i = -1;
  const at = [];
  while ((i = s.indexOf(n, i + 1)) >= 0 && at.length < 3) at.push(i);
  if (at.length) {
    console.log(JSON.stringify(n), "->", at.join(","));
    console.log("  ctx:", s.slice(at[0] - 100, at[0] + 190).replace(/\n/g, " ").slice(0, 290));
  }
}
