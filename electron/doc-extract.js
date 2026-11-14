// Attachment document extraction — give the model REAL document text instead
// of utf8-decoded binary mush. The old readText path decoded every file as
// utf8; binary never "fails" in Node, so PDFs silently became garbage the
// model couldn't summarize. Sniffs magic bytes and routes:
//   %PDF-        -> pdf-parse text extraction
//   PK\x03\x04   -> zip container: .docx (mammoth) / .xlsx (xlsx)
//   image magic  -> honest "not readable as text" result
//   else         -> utf8 text (previous behavior, incl. the binary heuristic)
const fsp = require("node:fs/promises");
const path = require("node:path");

const IMAGE_MAGICS = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], kind: "PNG image" },
  { bytes: [0xff, 0xd8, 0xff], kind: "JPEG image" },
  { bytes: [0x47, 0x49, 0x46, 0x38], kind: "GIF image" },
  { bytes: [0x52, 0x49, 0x46, 0x46], kind: "WebP image" }, // RIFF....WEBP
];

// binary = >10% non-text bytes in the first 4KB (text files are ~0%)
function looksBinary(buf) {
  const head = buf.subarray(0, 4096);
  let control = 0;
  for (const b of head) {
    if (b === 0 || (b < 9) || (b > 13 && b < 32)) control++;
  }
  return control / Math.min(head.length, 4096) > 0.1;
}

function sniff(buf, ext) {
  const head = buf.subarray(0, 1024).toString("latin1");
  if (head.includes("%PDF-")) return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    const e = ext.toLowerCase();
    if (e === ".docx") return "docx";
    if (e === ".xlsx" || e === ".xlsm") return "xlsx";
    return "zip";
  }
  for (const m of IMAGE_MAGICS) {
    if (m.bytes.every((b, i) => buf[i] === b)) return "image";
  }
  if (looksBinary(buf)) return "binary";
  return "text";
}

async function extractPdf(buf) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    const pages = result.total ? ` (${result.total} page${result.total === 1 ? "" : "s"})` : "";
    const text = (result.text || "").trim();
    if (!text) throw new Error("no extractable text — the PDF is likely scanned images (OCR not available)");
    return { text, note: `PDF${pages} text extracted` };
  } finally {
    await parser.destroy?.();
  }
}

async function extractDocx(buf) {
  const mammoth = require("mammoth");
  const res = await mammoth.extractRawText({ buffer: buf });
  return { text: (res.value || "").trim(), note: "Word document text extracted" };
}

async function extractXlsx(buf) {
  const XLSX = require("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    if (csv.trim()) parts.push(`### Sheet: ${name}\n${csv}`);
  }
  if (!parts.length) throw new Error("workbook has no readable cells");
  return { text: parts.join("\n\n").trim(), note: `spreadsheet extracted (${wb.SheetNames.length} sheet${wb.SheetNames.length === 1 ? "" : "s"})` };
}

/**
 * Extract model-readable text from a file buffer by sniffing its real type.
 * @returns {{ ok: true, content: string, note?: string } | { ok: false, error: string }}
 */
async function extractDocText(buf, fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  const kind = sniff(buf, ext);
  try {
    if (kind === "pdf") {
      const r = await extractPdf(buf);
      return { ok: true, content: r.text, note: r.note };
    }
    if (kind === "docx") {
      const r = await extractDocx(buf);
      return { ok: true, content: r.text, note: r.note };
    }
    if (kind === "xlsx") {
      const r = await extractXlsx(buf);
      return { ok: true, content: r.text, note: r.note };
    }
    if (kind === "zip") {
      return { ok: false, error: "zip archive attached as reference only — no text extraction for this type yet" };
    }
    if (kind === "image") {
      return { ok: false, error: "image attached as reference only — the model can't read images as text yet" };
    }
    if (kind === "binary") {
      return { ok: false, error: "binary file attached as reference only — no text extraction available for this type" };
    }
    // text (utf8) — previous behavior
    return { ok: true, content: buf.toString("utf8") };
  } catch (err) {
    return { ok: false, error: `${String(err?.message || err).slice(0, 200)}` };
  }
}

module.exports = { extractDocText, sniff };
