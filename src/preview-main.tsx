// Hover preview bubble for the desktop mark — the original's glass hover
// bubble (14px radius): a non-interactive overlay showing the latest chat so
// the mark is worth hovering. Rendered in its own click-through window.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LogoMark } from "./components/Brand";

type PreviewData = { title: string; snippet: string } | null;

function Bubble() {
  const [data, setData] = useState<PreviewData>(null);
  useEffect(() => {
    window.emberling.orb.onPreviewData((d: PreviewData) => setData(d));
  }, []);
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          background: "rgba(30,30,30,0.66)",
          border: "1px solid rgba(255,255,255,0.13)",
          borderRadius: 14,
          padding: "11px 13px",
          boxShadow: "0 10px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          overflow: "hidden",
        }}
      >
        <LogoMark size={26} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#f0f0f0",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data ? data.title || "New chat" : "Emberling"}
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: "17px",
              color: "rgba(252,252,252,0.62)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
              marginTop: 2,
            }}
          >
            {data ? data.snippet || "No messages yet — say hi." : "Ask anything."}
          </div>
          <div style={{ fontSize: 11, color: "rgba(252,252,252,0.42)", marginTop: 5 }}>
            Click the mark to open · Drop files to attach
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Bubble />);
