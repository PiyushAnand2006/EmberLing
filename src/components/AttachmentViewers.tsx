// Document viewers for attachments — the original ships dedicated viewers
// (chunk-xlsx, chunk-pdf, mammoth for docx); here docx/xlsx render inline and
// pdf opens in a viewer window (Chromium's built-in PDF).
import React, { useEffect, useState } from "react";
import type { Attachment } from "../types";
import { IconFile } from "./Icons";
import { Markdown } from "./Markdown";

function DocxView({ att }: { att: Attachment }) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const buf = await fetchFileBuffer(att);
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (alive) setHtml(result.value.slice(0, 200000));
      } catch (e) {
        if (alive) setError(String((e as Error).message || e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [att.id]);
  if (error) return <FileFallback att={att} note={error} />;
  return (
    <div className="photo-card" style={{ background: "rgba(0,0,0,0.25)", padding: 14, margin: "4px 0", maxWidth: 560 }}>
      <div style={{ fontSize: 11, color: "var(--cursor-text-tertiary)", marginBottom: 6 }}>📄 {att.name}</div>
      {html ? <div className="md" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="status-pill">Opening document…</div>}
    </div>
  );
}

function XlsxView({ att }: { att: Attachment }) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const buf = await fetchFileBuffer(att);
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (alive) setHtml(XLSX.utils.sheet_to_html(sheet).slice(0, 200000));
      } catch (e) {
        if (alive) setError(String((e as Error).message || e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [att.id]);
  if (error) return <FileFallback att={att} note={error} />;
  return (
    <div className="photo-card" style={{ background: "rgba(0,0,0,0.25)", padding: 14, margin: "4px 0", maxWidth: 620, overflowX: "auto" }}>
      <div style={{ fontSize: 11, color: "var(--cursor-text-tertiary)", marginBottom: 6 }}>📊 {att.name}</div>
      {html ? <div className="md" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="status-pill">Opening spreadsheet…</div>}
    </div>
  );
}

// attachments carry either inline text (already read) or an emberling-media url
async function fetchFileBuffer(att: Attachment): Promise<ArrayBuffer> {
  if (att.url && att.url.startsWith("emberling-media://")) {
    const res = await fetch(att.url);
    return res.arrayBuffer();
  }
  throw new Error("file content unavailable");
}

function FileFallback({ att, note }: { att: Attachment; note?: string }) {
  return (
    <div className="file-card">
      <div className="file-icon">
        <IconFile size={16} />
      </div>
      <div>
        <div className="file-name">{att.name}</div>
        <div className="file-meta">{note || `${(att.size / 1024).toFixed(1)} KB`}</div>
      </div>
    </div>
  );
}

export function AttachmentView({ att }: { att: Attachment }) {
  const lower = att.name.toLowerCase();
  if (att.kind === "image" && att.url) {
    return (
      <div className="photo-card" style={{ margin: "4px 0" }}>
        <img src={att.url} alt={att.name} />
      </div>
    );
  }
  if (lower.endsWith(".docx")) return <DocxView att={att} />;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return <XlsxView att={att} />;
  if (lower.endsWith(".pdf") && att.url) {
    return (
      <div className="file-card" style={{ cursor: "pointer" }} onClick={() => window.emberling.files.openViewer(att.filePath || "")} title="Open PDF">
        <div className="file-icon">📕</div>
        <div>
          <div className="file-name">{att.name}</div>
          <div className="file-meta">click to open in viewer</div>
        </div>
      </div>
    );
  }
  if (att.text) {
    return (
      <details className="tool-line" style={{ display: "block" }}>
        <summary>
          <IconFile size={13} />
          <span className="tool-name">{att.name}</span>
          <span style={{ color: "var(--cursor-text-quaternary)" }}>{(att.size / 1024).toFixed(1)} KB · attached</span>
        </summary>
        <pre>{att.text.slice(0, 4000)}</pre>
      </details>
    );
  }
  return <FileFallback att={att} />;
}

export { FileFallback };
