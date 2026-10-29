// Offline OCR — the rebuild's stand-in for the original's sand-card-text-recognition
// native module. Windows 10+ only: Windows.Media.Ocr projected through PowerShell,
// so no native addon and no model downloads. macOS/Linux get a clear message.
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PS_SCRIPT = path.join(__dirname, "ocr.ps1");

function ocrImage(imagePath) {
  const file = String(imagePath || "").trim().replace(/^["']|["']$/g, "");
  if (!file) return Promise.resolve({ ok: false, error: "ocr_image needs an image 'path' argument" });
  if (process.platform !== "win32") return Promise.resolve({ ok: false, error: "ocr_image uses Windows.Media.Ocr — available on Windows builds" });
  if (!fs.existsSync(file)) return Promise.resolve({ ok: false, error: `file not found: ${file}` });
  if (!/\.png$|\.jpe?g$|\.bmp$/i.test(file)) return Promise.resolve({ ok: false, error: "unsupported image type — png/jpg/bmp" });
  // WinRT GetFileFromPathAsync rejects forward slashes — hand it a normalized one
  const abs = path.resolve(file);
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS_SCRIPT, abs],
      { timeout: 30_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) return resolve({ ok: false, error: (stderr || err.message || "powershell failed").slice(0, 300) });
        const text = String(stdout || "").replace(/\r/g, "").trim();
        if (!text) return resolve({ ok: false, error: "no text recognized in the image" });
        if (text === "__OCR_NOLANGUAGE__") return resolve({ ok: false, error: "no OCR language installed — add one under Windows Settings → Time & language → Language" });
        resolve({ ok: true, text: text.slice(0, 8000) });
      }
    );
  });
}

module.exports = { ocrImage };
