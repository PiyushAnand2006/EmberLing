# REA Findings — Grok Bot 0.75.8 (Setup.exe)

Static reverse-engineering analysis of `Grok_Bot_0.75.8_Setup.exe` (NSIS → `app-64.7z` → Electron app → `app.asar`).
All observations below are from extracted static artifacts (no execution of the original app).
Basis: `.rea-extract/asar-extracted/` (kept for reference; excluded from the rebuild).

## Identity & stack
- **Product**: "Grok Bot" desktop agent, author "SpaceXAI", internal codename `sand`, v0.75.8.
- **Stack**: Electron + React + StyleX + TipTap composer + TanStack Query + Lingui i18n (34 locales) + Connect-RPC/protobuf.
- **Backend**: `api2.cursor.sh` (+ `grok.com`, `x.ai` CSP allow-list), auth via Cursor login, auto-update from `api2.cursor.sh/updates`.
- **Telemetry**: Statsig + Sentry (removed in rebuild).

## Process architecture
- Frameless main chat window (`frame:null`), menubar/tray window, desktop-mount orb window, capture overlay, several dialogs (420/520px).
- Custom protocol handlers: `sand-avatar:`, `sand-favicon:`, `sand-media:`, `sand-html-preview:`, `sand-canvas:`, `sand-mcp-app:`, `sand-visualization:`.
- `local-exec-daemon` — executes agent actions locally; `node-agent-coordinator` — subagent coordination; Linux sandbox at `/home/box`.
- Native modules: `sand-window-capture`, `sand-devicecheck`, `sand-notification-settings`, `sand-card-text-recognition`, `cursor-proclist`, tree-sitter.

## Design system (dark, exact tokens from `index-CFSAhbDS.css`)
| Token | Value |
|---|---|
| `--cursor-chrome` (window chrome) | `#141414` |
| `--cursor-pane` / sidebar / elevated | `#181818` |
| `--cursor-base` (= text primary) | `#f0f0f0` |
| `--cursor-text-secondary` | `#fcfcfc99` |
| `--cursor-brand` | `#f54e00` |
| `--cursor-accent` | `#599ce7` |
| blue/green/orange/cyan/yellow/magenta/purple/danger | `#7bafe9` `#3fa266` `#d08770` `#81a1c1` `#f1b467` `#b48ead` `#9386f2` `#e34671` |
| radii | lg 8px, xl 12px |
| spacing scale | 4px base (4…80) |
| conversation text | 14px / 22px line-height; bubble max-width 640px |
| sidebar | 180px (48px collapsed) |

**iMessage-style bubbles** (`--sand-*`): user fill `#1c1c1c` + white text; agent fill `#1c1c1c0f`; user color variants:
blue `#126fd4`, green `#0d9655`, purple `#7442d1`, orange `#d2550a`, red `#c82532`, cyan `#0d9381`, magenta `#c82779`, brown `#86592e`, yellow `#c2730b`.
Fonts: system sans; mono for code; KaTeX math; icon font `cursor-icons`.

## Features (evidence: chunk names, Lingui catalogs, tool-name strings)
1. **Chat** — conversations sidebar (unreads/mute/pin), iMessage-style bubbles + reactions, voice-memo bubbles, transcript search, draft revisions, queued sends.
2. **Composer** — TipTap rich editor, attachments (files/photos/voice), model picker, approval mode ("Ask first" rules), auto-review selector; placeholder "Ask anything".
3. **Agent** — runs "On your computer" or "On its computer" (cloud box); tools observed: `bash`/`shell`, file read/write/edit, `WebSearch`, `WebFetch`, `Screenshot`, `PlacesSearch`, `WeatherForecast`, photo/video generation, `SendEmail`, `SendIMessage`, `ReactToMessage`, `RequestUserForm`, `SendMessage`, subagents (`MessageSubagent`, `StopSubagent`), MCP servers (install/uninstall/restart/instructions), plugins, skills.
4. **Status pills** — "Working", "Drafting the file", "Browsing the web", "Searching the web", "Reading a file", "Generating a photo/video", "Waiting on a command", "Waiting for you".
5. **Bots** — personal + team bots, templates (import/share links), manage screen (knowledge, files library, avatar editor), sharing.
6. **Cloud agents** — publish flow (URL, access, live preview), artifacts, GitHub/GitLab/Bitbucket/Azure DevOps repos.
7. **Integrations** — Slack, Microsoft Teams, iMessage, Email, Linear, Zoom, 1Password, Google API key, Entra ID, SharePoint.
8. **Automations** — Slack/repo triggers, schedules, routines.
9. **Memories** — memory list, export, "never save passwords/API keys" rule.
10. **Voice** — calls, memos, transcription (`grok-transcribe`), "Learn from demonstration" screen recording.
11. **Cards/artifacts** — file/photo cards, canvases, Mermaid, d3/three visualizations, xlsx/pdf/docx viewers, HTML preview.
12. **Security** — vault-stored secrets, WebAuthn/passkey proxy, credential approvals.
13. **Settings** — General, Account, Notifications, Bots, Memories, Appearance, Voice, Integrations, About.
14. **Desktop mount orb** — 56–62px draggable always-on-top mark; file drop target; hover preview bubble (14px radius glass).
15. **Tray/menubar, onboarding, Pro+ upgrade/payments** (backend-bound; out of scope for free clone).

## Rebuild decisions (separating observation from design)
- Rebuilt as Electron + React + Vite + TypeScript with the extracted tokens above for pixel-faithful dark UI.
- Paid Cursor backend replaced by **free API key providers** (OpenRouter / Groq / Google Gemini / Cerebras / Mistral — OpenAI-compatible) with BYO-key settings and multi-provider fallback.
- Agent tools run locally in the Electron main process (sandboxed behind explicit approval modes), web tools via DuckDuckGo HTML + direct fetch.
- Cloud/team/Slack/publish features that fundamentally require the vendor's backend are represented in-UI (manage screens, flows) backed by local storage.
