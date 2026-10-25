import React, { useState } from "react";
import { useApp } from "../state";
import { PopoverMenu } from "./Menu";
import { timeLabel } from "./ChatView";
import { LogoMark } from "./Brand";
import {
  IconPencil,
  IconSearch,
  IconSettings,
  IconBot,
  IconBrain,
  IconClock,
  IconPlug,
  IconTrash,
  IconPin,
  IconBellOff,
  IconBell,
  IconChevronDown,
} from "./Icons";

export function Sidebar() {
  const app = useApp();
  const { conversations, activeConversationId, settings } = app;
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");

  const sorted = [...conversations].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });
  const filtered = query
    ? sorted.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.messages.some((m) => m.content.toLowerCase().includes(query.toLowerCase()))
      )
    : sorted;

  const pinned = filtered.filter((c) => c.pinned);
  const rest = filtered.filter((c) => !c.pinned);

  const newChat = () => {
    app.setActiveConversationId(null);
    app.navigate({ kind: "chat" });
  };

  const convMenu = (id: string) => [
    {
      label: "Pin",
      icon: <IconPin size={13} />,
      onClick: () =>
        app.setConversations((list) => list.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))),
    },
    {
      label: conversations.find((c) => c.id === id)?.muted ? "Unmute" : "Mute",
      icon: conversations.find((c) => c.id === id)?.muted ? <IconBell size={13} /> : <IconBellOff size={13} />,
      onClick: () =>
        app.setConversations((list) => list.map((c) => (c.id === id ? { ...c, muted: !c.muted, unread: c.muted ? c.unread : 0 } : c))),
    },
    {
      label: "Delete",
      icon: <IconTrash size={13} />,
      danger: true,
      onClick: () => {
        app.setConversations((list) => list.filter((c) => c.id !== id));
        if (activeConversationId === id) app.setActiveConversationId(null);
      },
    },
  ];

  const row = (c: (typeof conversations)[number]) => (
    <div
      key={c.id}
      className={`conv-item${c.id === activeConversationId ? " active" : ""}`}
      onClick={() => {
        app.setActiveConversationId(c.id);
        app.navigate({ kind: "chat" });
        app.setConversations((list) => list.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)));
      }}
    >
      {c.muted ? (
        <span className="conv-muted">
          <IconBellOff size={13} />
        </span>
      ) : null}
      <span className="conv-item-title">{c.title || "New chat"}</span>
      {c.automationId ? <IconClock size={12} /> : null}
      {!!c.unread && !c.muted ? (
        <span className="conv-unread">
          <span className="conv-unread-text">{c.unread > 9 ? "9+" : c.unread}</span>
        </span>
      ) : null}
      <span className="conv-item-meta">{timeLabel(c.updatedAt)}</span>
      <span className="conv-item-actions" onClick={(e) => e.stopPropagation()}>
        <PopoverMenu trigger={(open) => (
          <button className="icon-btn" onClick={open}>
            <IconChevronDown size={13} />
          </button>
        )} items={convMenu(c.id)} />
      </span>
    </div>
  );

  return (
    <div className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-header">
        <button
          className="sidebar-avatar"
          title={settings.userName || "Account"}
          onClick={() => app.navigate({ kind: "settings", section: "account" })}
        >
          {settings.userName ? settings.userName[0].toUpperCase() : <LogoMark size={14} variant="mono" />}
        </button>
        <div className="sidebar-label" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
            {!settings.userName && <LogoMark size={16} />}
            {settings.userName || "Emberling"}
          </div>
        </div>
        <button className="icon-btn" title={collapsed ? "Expand" : "Collapse"} onClick={() => setCollapsed((v) => !v)}>
          <span style={{ display: "inline-flex", transform: collapsed ? "rotate(180deg)" : "none" }}>
            <IconChevronDown size={14} />
          </span>
        </button>
      </div>

      <button className="sidebar-new-chat" onClick={newChat}>
        <IconPencil size={14} />
        <span className="sidebar-label">New chat</span>
      </button>

      <div className="sidebar-search">
        <IconSearch size={13} />
        <input placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="sidebar-conversations">
        {pinned.length > 0 && (
          <>
            <div className="sidebar-section-title">
              <span className="sidebar-label">Pinned</span>
            </div>
            {pinned.map(row)}
          </>
        )}
        <div className="sidebar-section-title">
          <span className="sidebar-label">Chats</span>
        </div>
        {rest.length === 0 && (
          <div className="sidebar-label" style={{ padding: "8px 10px", fontSize: 12, color: "var(--cursor-text-quaternary)" }}>
            No conversations yet
          </div>
        )}
        {rest.map(row)}
      </div>

      <div className="sidebar-footer">
        <button className="footer-row" onClick={() => app.navigate({ kind: "bots" })}>
          <IconBot size={15} />
          <span className="sidebar-label">Bots</span>
        </button>
        <button className="footer-row" onClick={() => app.navigate({ kind: "memories" })}>
          <IconBrain size={15} />
          <span className="sidebar-label">Memories</span>
        </button>
        <button className="footer-row" onClick={() => app.navigate({ kind: "automations" })}>
          <IconClock size={15} />
          <span className="sidebar-label">Automations</span>
        </button>
        <button className="footer-row" onClick={() => app.navigate({ kind: "integrations" })}>
          <IconPlug size={15} />
          <span className="sidebar-label">Integrations</span>
        </button>
        <button className="footer-row" onClick={() => app.navigate({ kind: "settings" })}>
          <IconSettings size={15} />
          <span className="sidebar-label">Settings</span>
        </button>
      </div>
    </div>
  );
}
