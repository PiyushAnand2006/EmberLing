import React, { useEffect, useRef, useState } from "react";

export interface MenuItemSpec {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export function PopoverMenu({
  trigger,
  items,
  align = "end",
  header,
}: {
  trigger: (open: () => void) => React.ReactNode;
  items: MenuItemSpec[];
  align?: "start" | "end";
  header?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const width = 220;
    const left = align === "end" ? Math.max(8, r.right - width) : Math.min(window.innerWidth - width - 8, r.left);
    const estHeight = items.length * 34 + (header ? 26 : 0) + 12;
    const top = r.bottom + 6 + estHeight > window.innerHeight ? Math.max(8, r.top - estHeight - 6) : r.bottom + 6;
    setPos({ top, left });
  }, [open, items.length, align, header]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Defer attaching the dismiss listener to the next task: for trusted
    // clicks React flushes effects while the opening click is still
    // propagating, and a listener attached mid-dispatch would catch that same
    // event's arrival at window and close the menu instantly.
    const timer = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("blur", close);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [open]);

  return (
    <span ref={anchorRef} style={{ display: "inline-flex" }}>
      {trigger(() => setOpen((v) => !v))}
      {open && pos && (
        <div className="menu" style={{ top: pos.top, left: pos.left, position: "fixed" }} onClick={(e) => e.stopPropagation()}>
          {header && <div className="menu-label">{header}</div>}
          {items.map((item, i) => (
            <button
              key={i}
              className={`menu-item${item.danger ? " danger" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon}
              <span style={{ flex: 1 }}>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
