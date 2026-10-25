// Rasterize assets/brand/app-icon.svg → build/icon.ico + build/icon.png
// with TRUE alpha transparency: an offscreen page draws the SVG into a
// <canvas> (data-URL image) and exports PNGs via toDataURL — no screen
// capture, so the corners stay transparent on any desktop background.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const SIZES = [1024, 512, 256, 128, 64, 48, 32, 24, 16];

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, "assets", "brand", "app-icon.svg"), "utf8");
  const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  // self-contained worker page (file:// so console output streams to main)
  const workerHtml = `<!doctype html><html><body><script>
const SIZES = ${JSON.stringify(SIZES)};
(async () => {
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("svg decode failed")); img.src = ${JSON.stringify(svgDataUrl)}; });
    const pngs = {};
    for (const size of SIZES) {
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, size, size);
      pngs[size] = c.toDataURL("image/png");
    }
    // alpha check: corners of the master render must be fully transparent
    const check = new Image();
    await new Promise((res, rej) => { check.onload = res; check.onerror = () => rej(new Error("png decode failed")); check.src = pngs[${SIZES[0]}]; });
    const vc = document.createElement("canvas");
    vc.width = 64; vc.height = 64;
    const vctx = vc.getContext("2d");
    vctx.drawImage(check, 0, 0, 64, 64);
    const d = vctx.getImageData(0, 0, 64, 64).data;
    const alphaAt = (x, y) => d[(y * 64 + x) * 4 + 3];
    const corners = [alphaAt(1, 1), alphaAt(62, 1), alphaAt(1, 62), alphaAt(62, 62)];
    window.__result = { ok: true, alphaOk: corners.every(a => a === 0), corners, pngs };
  } catch (e) {
    window.__result = { ok: false, error: String(e && e.message || e) };
  }
})();
</script></body></html>`;

  const workerPath = path.join(root, "build", "icon-worker.html");
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  fs.writeFileSync(workerPath, workerHtml);

  const win = new BrowserWindow({ show: false, width: 1200, height: 1200 });
  await win.loadFile(workerPath);

  // poll for the worker's result (timeout 30s)
  let result = null;
  for (let i = 0; i < 100 && !result; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      result = await win.webContents.executeJavaScript("window.__result || null");
    } catch {}
  }

  if (!result || !result.ok) {
    console.error("render failed:", result && result.error);
    win.destroy();
    app.quit();
    process.exit(1);
  }
  if (!result.alphaOk) {
    console.error("alpha check failed — corners not transparent:", result.corners);
    win.destroy();
    app.quit();
    process.exit(1);
  }
  console.log("alpha check: corners transparent OK");

  const pngs = new Map();
  for (const [sizeStr, dataUrl] of Object.entries(result.pngs)) {
    const size = Number(sizeStr);
    const buf = Buffer.from(String(dataUrl).split(",")[1], "base64");
    pngs.set(size, buf);
    fs.writeFileSync(path.join(root, "build", `icon-${size}.png`), buf);
  }
  fs.writeFileSync(path.join(root, "build", "icon.png"), pngs.get(1024));

  // ICO container with PNG-compressed frames (256/64/48/32/16)
  const frames = [256, 64, 48, 32, 16].map((size) => ({ size, data: pngs.get(size) }));
  const headerSize = 6 + frames.length * 16;
  let offset = headerSize;
  const dirEntries = [];
  for (const f of frames) {
    dirEntries.push(Buffer.from([f.size >= 256 ? 0 : f.size, f.size >= 256 ? 0 : f.size, 0, 0, 1, 0, 32, 0]));
    const len = Buffer.alloc(4);
    len.writeUInt32LE(f.data.length);
    const off = Buffer.alloc(4);
    off.writeUInt32LE(offset);
    dirEntries.push(len, off);
    offset += f.data.length;
  }
  const ico = Buffer.concat([Buffer.from([0, 0, 1, 0, frames.length, 0]), ...dirEntries, ...frames.map((f) => f.data)]);
  fs.writeFileSync(path.join(root, "build", "icon.ico"), ico);

  fs.unlinkSync(workerPath);
  console.log("icons written:", fs.readdirSync(path.join(root, "build")).join(", "));
  win.destroy();
  app.quit();
});
