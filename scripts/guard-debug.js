// Debug: guard root matching against a simulated install tree.
const os = require("node:os");
const path = require("node:path");
const INSTALL = path.join(os.tmpdir(), "emberling-guard-test", "app-install");
const g = require("C:\\Users\\thaku\\hackathon-projects\\EmberLink-GROK\\electron\\guard.js").createGuard({
  roots: [INSTALL, path.join(INSTALL, "resources")],
  userDataDir: path.join(os.tmpdir(), "emberling-guard-test", "userdata"),
});
console.log("rootList:", g.rootList);
const t = path.join(INSTALL, "electron", "main.js");
console.log("target:", t);
console.log("check:", g.checkWrite(t));
