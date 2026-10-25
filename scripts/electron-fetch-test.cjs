// Diagnostics: fetch from inside Electron's main process network stack.
const { app } = require("electron");
(async () => {
  for (const attempt of ["plain", "with-headers"]) {
    try {
      const headers =
        attempt === "plain"
          ? { "Content-Type": "application/json" }
          : { "Content-Type": "application/json", Authorization: "Bearer free", "HTTP-Referer": "https://github.com/emberling", "X-Title": "Emberling" };
      const res = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers,
        body: JSON.stringify({ model: "openai", stream: true, messages: [{ role: "user", content: "count 1 to 3" }] }),
      });
      const text = await res.text();
      console.log(`ELECTRON-MAIN ${attempt} status: ${res.status} ${text.slice(0, 140).replace(/\n/g, " ")}`);
    } catch (e) {
      console.log(`ELECTRON-MAIN ${attempt} ERR ${e.message}`);
    }
  }
  app.quit();
})();
