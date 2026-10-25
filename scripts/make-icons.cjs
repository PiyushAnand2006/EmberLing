// Rasterize assets/brand/app-icon.svg → build/icon.ico + build/icon.png
// using an offscreen Electron window (reliable SVG rendering), then wire
// sizes via nativeImage.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "assets", "brand", "app-icon.svg"), "utf8");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, webPreferences: { offscreen: true } });
  const html = `<!doctype html><html><body style="margin:0;background:transparent;padding:40px;box-sizing:border-box">${svg.replace('width="512" height="512"', 'width="944" height="944"')}</body></html>`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 600));
  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.join(root, "build"), { recursive: true });

  // 1024 master png + common sizes
  fs.writeFileSync(path.join(root, "build", "icon.png"), image.toPNG());
  for (const size of [512, 256, 128, 64, 48, 32, 24, 16]) {
    const resized = image.resize({ width: size, height: size });
    fs.writeFileSync(path.join(root, "build", `icon-${size}.png`), resized.toPNG());
  }

  // Windows .ico: craft from PNG frames (ICO container supporting PNG data)
  const png256 = fs.readFileSync(path.join(root, "build", "icon-256.png"));
  const png64 = fs.readFileSync(path.join(root, "build", "icon-64.png"));
  const png48 = fs.readFileSync(path.join(root, "build", "icon-48.png"));
  const png32 = fs.readFileSync(path.join(root, "build", "icon-32.png"));
  const png16 = fs.readFileSync(path.join(root, "build", "icon-16.png"));
  const frames = [
    { size: 256, data: png256 },
    { size: 64, data: png64 },
    { size: 48, data: png48 },
    { size: 32, data: png32 },
    { size: 16, data: png16 },
  ];
  const headerSize = 6 + frames.length * 16;
  let offset = headerSize;
  const dirEntries = [];
  for (const f of frames) {
    dirEntries.push(
      Buffer.from([
        f.size >= 256 ? 0 : f.size, f.size >= 256 ? 0 : f.size, // width, height (0 = 256)
        0, 0, // palette
        1, 0, // planes
        32, 0, // bpp
      ])
    );
    const len = Buffer.alloc(4);
    len.writeUInt32LE(f.data.length);
    const off = Buffer.alloc(4);
    off.writeUInt32LE(offset);
    dirEntries.push(len, off);
    offset += f.data.length;
  }
  const ico = Buffer.concat([Buffer.from([0, 0, 1, 0, frames.length, 0]), ...dirEntries, ...frames.map((f) => f.data)]);
  fs.writeFileSync(path.join(root, "build", "icon.ico"), ico);

  console.log("icons written:", fs.readdirSync(path.join(root, "build")).join(", "));
  app.quit();
});
