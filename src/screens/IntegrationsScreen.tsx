import React from "react";
import { useApp } from "../state";
import { Scout } from "../components/Brand";

// Integrations observed in the original: Slack, Microsoft Teams, iMessage,
// Email, GitHub, GitLab, Bitbucket, Azure DevOps, Linear, Zoom, 1Password,
// Google, SharePoint, Entra ID. Those flows need the vendor backend; here the
// connect state is local (the agent can still use web tools to work with
// public services).
const INTEGRATIONS: { id: string; name: string; icon: string; desc: string }[] = [
  { id: "slack", name: "Slack", icon: "💬", desc: "Wake automations on Slack messages, mentions and reactions." },
  { id: "teams", name: "Microsoft Teams", icon: "👥", desc: "Chat with Emberling inside Teams channels." },
  { id: "imessage", name: "iMessage", icon: "🍎", desc: "Send and react to messages from your chats." },
  { id: "email", name: "Email", icon: "✉️", desc: "Draft and send email on your behalf." },
  { id: "github", name: "GitHub", icon: "🐙", desc: "Let automations watch a repo's PRs, issues and CI." },
  { id: "gitlab", name: "GitLab", icon: "🦊", desc: "Cloud agents can work on your repositories." },
  { id: "bitbucket", name: "Bitbucket", icon: "🪣", desc: "Cloud agents can work on your repositories." },
  { id: "azure", name: "Azure DevOps", icon: "🔵", desc: "Cloud agents can work on your repositories." },
  { id: "linear", name: "Linear", icon: "📐", desc: "Create and update issues from chat." },
  { id: "zoom", name: "Zoom", icon: "📹", desc: "Join calls and take notes for you." },
  { id: "onepassword", name: "1Password", icon: "🔑", desc: "Store secrets in your vault instead of chat." },
  { id: "google", name: "Google API Key", icon: "🔍", desc: "Powered search and calendar access." },
];

export function IntegrationsScreen() {
  const { integrations, setIntegrations, toast } = useApp();
  const connected = integrations.connected || {};

  return (
    <div className="screen">
      <div className="screen-content" style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Scout size={52} />
          <h2 style={{ margin: 0 }}>Integrations</h2>
        </div>
        <div className="screen-sub">
          Connections from the original app. This local rebuild simulates connect state — public services remain reachable through the agent's web tools.
        </div>
        <div className="integration-grid">
          {INTEGRATIONS.map((i) => (
            <div key={i.id} className="integration-card">
              <div className="int-icon">{i.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="int-name">{i.name}</span>
                  <span className={`badge${connected[i.id] ? " ok" : " neutral"}`}>{connected[i.id] ? "Connected" : "Not connected"}</span>
                </div>
                <div className="int-desc">{i.desc}</div>
                <button
                  className={connected[i.id] ? "btn subtle" : "btn"}
                  style={{ marginTop: 8, padding: "4px 12px", fontSize: 12 }}
                  onClick={() => {
                    setIntegrations((s) => ({ connected: { ...s.connected, [i.id]: !s.connected[i.id] } }));
                    toast(connected[i.id] ? `${i.name} disconnected` : `${i.name} connected (simulated)`);
                  }}
                >
                  {connected[i.id] ? "Disconnect" : "Connect"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
