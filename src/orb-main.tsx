// Desktop mount "mark" — the always-on-top draggable orb from the original
// (desktop-mount-panel): drag anywhere on it to move the window (custom
// pointer tracking, like the original's data-dragging flow), click to open
// Emberling, drop files to attach them to a chat.
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LogoMark } from "./components/Brand";

const CLICK_SLOP = 5; // px of movement before a press becomes a drag

function Orb() {
  const [dropping, setDropping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const press = useRef({ active: false, moved: 0, lastX: 0, lastY: 0 });
  const hoverTimer = useRef<number | null>(null);

  const stopHover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    window.emberling.orb.hover(false);
  };

  const onHoverStart = () => {
    if (press.current.active) return;
    // intent delay so a pass-over pointer doesn't flash the bubble
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      if (!press.current.active) window.emberling.orb.hover(true);
    }, 300);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    stopHover();
    press.current = { active: true, moved: 0, lastX: e.screenX, lastY: e.screenY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!press.current.active) return;
    const dx = e.screenX - press.current.lastX;
    const dy = e.screenY - press.current.lastY;
    press.current.lastX = e.screenX;
    press.current.lastY = e.screenY;
    press.current.moved += Math.abs(dx) + Math.abs(dy);
    if (press.current.moved > CLICK_SLOP) {
      setDragging(true);
      window.emberling.orb.moveBy(dx, dy);
    }
  };

  const onPointerUp = () => {
    const wasDrag = press.current.moved > CLICK_SLOP;
    press.current.active = false;
    if (wasDrag) {
      setDragging(false);
      window.emberling.orb.savePosition();
    } else {
      window.emberling.orb.toggleMain();
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const files = [...e.dataTransfer.files].map((f) => (f as any).path).filter(Boolean);
        if (files.length) window.emberling.orb.filesDropped(files);
      }}
    >
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={onHoverStart}
        onMouseLeave={stopHover}
        title="Emberling — click to open, drag to move, drop files to attach"
        style={{
          width: 58,
          height: 58,
          borderRadius: "50%",
          border: dropping ? "2px solid #f54e00" : "1px solid rgba(255,255,255,0.12)",
          background: "radial-gradient(circle at 32% 28%, #2c2c2c, #0e0e0e 72%)",
          boxShadow: dropping
            ? "0 0 0 6px rgba(245,78,0,0.25), 0 0 30px rgba(245,78,0,0.35)"
            : "0 0 0 4px rgba(0,0,0,0.35), 0 6px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.09)",
          cursor: dragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: dragging ? "none" : "transform .15s cubic-bezier(.23,1,.32,1), box-shadow .15s ease",
          transform: dropping ? "scale(1.12)" : "none",
          touchAction: "none",
        }}
      >
        <LogoMark size={34} />
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Orb />);
