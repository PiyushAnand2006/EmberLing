# EmberLing

![EmberLing](assets/brand/app-icon.svg)

**EmberLing** is a desktop AI agent for Windows — chat, tools, bots, automations, MCP, voice, publishing — rebuilt from static reverse-engineering (REA) of a shipped 124 MB installer (`Grok_Bot_0.75.8_Setup.exe`) and re-wired to run entirely on **free / keyless AI providers**. Built for learning and hackathon use.

> ⚠️ **Caution:** this project reconstructs the UI/UX language and feature surface of a commercial app for educational purposes. It ships none of the original's code, keys, or backend access. Don't use it to impersonate the original product.

> 🔥 **Etymology:** *ember* — one bright dot of fire in orbit — + *-ling*, a small creature. The mascot **Orby** is exactly that: a glowing dot with an orbit ring and a satellite bead. The bot family (Dotlings) shares the same geometry.

**One-line pitch:** every feature of a paid desktop agent, running on a free API key — or no key at all.

---

## Screenshots

| | |
|---|---|
| ![Chat — empty state](docs/screenshots/01-chat-empty.png) | ![Chat — conversation](docs/screenshots/02-chat-conversation.png) |
| *Greeting + suggestion chips + composer* | *Streaming reply, rich composer, iMessage-style bubbles* |
| ![Settings — General](docs/screenshots/03-settings-general.png) | ![Settings — MCP servers](docs/screenshots/04-settings-mcp.png) |
| *Free providers with Test button, approval modes, tool toggles* | *Add real stdio MCP servers; their tools join the agent* |
| ![Settings — Usage](docs/screenshots/05-settings-usage.png) | ![Appearance](docs/screenshots/06-appearance.png) |
| *Local token tracking + Emberling Plus* | *10 bubble colors with live preview* |
| ![Bots](docs/screenshots/07-bots.png) | ![New bot creation window](docs/screenshots/08-bot-editor-publish.png) |
| *Personal & team bots, Dotling avatars* | *Bot creation — Dotling faces, instructions, knowledge, templates & publish* |
| ![Automations](docs/screenshots/09-automations.png) | ![Integrations](docs/screenshots/10-integrations.png) |
| *Scheduled prompts into their own chat* | *The original's connection surface* |

More in [`docs/screenshots/`](docs/screenshots) — including Memories, MCP, and Usage.

The **desktop mark**: an always-on-top draggable orb (click to open, drop files to attach). Lives at the right edge, position remembered across launches. The **tray** carries recent chats, a global "New chat", and orb toggle.

---

## Architecture

![Emberling system architecture](docs/diagram-architecture.png)

The renderer crosses a contextIsolation IPC boundary into the Electron main process — a pure dispatcher: the agent loop drives a fallback chain of free LLM providers and dispatches an approval-gated tool host to three execution targets (this host, a per-Dotling **WSL Linux VM** that runs approval-free, or a remote **SSH host**), reaches **38 real integration tools** (git hosts, Slack, Teams, email — secrets DPAPI-encrypted, never shown to the model), and persists everything to local JSON. Keyless Pollinations chats out of the box; keyed providers unlock tool calls; MCP servers join as `mcp_<server>_<tool>`. Automations run headless in this process — webhook-triggerable, with privileged host tools auto-declined when nobody is there to approve.

```
┌────────────────────────────── Windows ──────────────────────────────┐
│                                                                     │
│  ┌──────────────┐   IPC (contextBridge)   ┌──────────────────────┐  │
│  │ Main window  │ ◄──────────────────────► │ Electron main        │  │
│  │ React + Vite │   agent:event stream     │ ├─ agent.js (loop)   │  │
│  │ frameless    │   approvals / forms      │ ├─ tools.js (37)     │  │
│  │              │                          │ ├─ integrations (38) │  │
│  │              │                          │ ├─ sandbox.js (WSL)  │  │
│  └──────────────┘                          │ ├─ mcp.js (stdio)    │  │
│  ┌──────────────┐                          │ ├─ providers.js      │  │
│  │ Desktop orb  │ ◄── orb:move/drop ──────►│ ├─ publish.js (http) │  │
│  └──────────────┘                          │ ├─ shell-runner.js   │  │
│  ┌──────────────┐                          │ └─ store.js (JSON)   │  │
│  ┌──────────────┐                          └──────────┬───────────┘  │
│  │ Tray         │◄───────────────────────────────────┘              │
│  └──────────────┘        free providers: Pollinations (keyless),    │
│  ┌──────────────┐         Groq, OpenRouter, Gemini, Cerebras,       │
│  │ Published    │◄── LAN HTTP ── Mistral, or any OpenAI-compatible   │
│  │ web chat     │                                                    │
│  └──────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

- **`electron/main.js`** — frameless main window, orb, tray, IPC surface (~40 channels), headless automations scheduler (+ webhook triggers), auto-update via electron-updater (GitHub releases), usage tracking, teach-mode capture.
- **`electron/agent.js`** — tool-calling turn loop: stream → status pill → tool lines → results → continue (max 24 steps); OpenAI tool-call protocol plus a text-mode fallback (```tool blocks) for keyless/small models, with call repair.
- **`electron/tools.js`** — 37 core tools + dynamic MCP/plugin injection; user auto-review rules, then approval gating per mode (ask / askRisky / auto); routes shell & file tools to the sandbox VM or SSH host per execution target.
- **`electron/sandbox.js`** — per-Dotling private WSL Ubuntu VMs (lazily cloned from a base distro); shell/file tools run inside the bot's own VM, approval-free by isolation.
- **`electron/remote.js`** — SSH execution target ("On its computer"): app-generated ed25519 key, Windows OpenSSH client.
- **`electron/browser.js`** — drives the installed Chrome/Edge over CDP (navigate, snapshot, click, type, read, screenshot) with an isolated profile.
- **`electron/agent-store.js`** — per-bot file store (`userData/agent-store/<scope>`) with 20-deep version history.
- **`electron/integration-tools.js` + `electron/integrations/`** — 38 real integration tools: GitHub/GitLab/Bitbucket/Azure repos, Slack, Teams (Graph OAuth), SMTP/IMAP email, iMessage, 1Password (`op` CLI) + workspace tools (unified search, contacts, calendar, skills). Credentials decrypt only inside the dispatcher (DPAPI via `secure-store.js`) — the model never sees tokens.
- **`electron/providers.js`** — OpenAI-compatible streaming client, multi-provider fallback, model-id self-heal, live `/models` discovery into the picker, Whisper transcription.
- **`electron/shell-runner.js`** — the only spawn site. Script text → generated 0600 temp file → executed by absolute path. Never in argv.
- **`electron/mcp.js`** — real MCP stdio JSON-RPC client (initialize → tools/list → tools/call).
- **`electron/publish.js`** — HTTP server hosting published bots as web chats with token links + access control.
- **`src/`** — React renderer: chat (bubbles, tool lines, approval/form cards, mermaid/chart/html/clip blocks), composer, screens (Settings/Bots/Memories/Automations/Integrations/Onboarding), i18n (8 locales), design tokens extracted verbatim from the original's CSS.

### One agent turn

![One agent turn, end to end](docs/diagram-agent-turn.png)

A message flows to the main-process agent loop, which streams from the active provider (failing over to the next configured key on error). Proposed tool calls pass your auto-review rules and the approval mode before the tool host executes them — host-side privileged calls wait on you, sandbox-VM turns run approval-free, and headless runs auto-decline them; results feed back into the next model call, looping up to 24 steps until the final reply streams in.

Design tokens recovered by REA (exact values): chrome `#141414`, pane `#181818`, brand `#f54e00`, accent `#599ce7`, Nord-style semantic palette, 4px spacing scale, 8/12px radii, bubble fills `#1c1c1c` / `#1c1c1c0f`.

---

## Installation

### Option A — Desktop app (latest release: v0.75.8)

Grab a build from [**Releases**](https://github.com/PiyushAnand2006/EmberLing/releases):

| File | What it is |
|---|---|
| `Emberling-Setup-0.75.8.exe` | NSIS installer (~105 MB) — desktop + start-menu shortcuts, uninstaller |
| `Emberling-Portable-0.75.8.exe` | Single portable exe (~105 MB) — run from anywhere, installs nothing |

1. Download and run the setup (or the portable).
2. Launch **Emberling**. It works immediately — the default provider (Pollinations) needs **no API key**.
3. Optional: add a free key in **Settings → General** for tool-calling + faster models.

> Windows SmartScreen may warn on unsigned builds — choose "More info → Run anyway", or build from source below.

### Update the app

**Installed (Setup) users:**

1. Quit Emberling — right-click the tray icon (orange dot) → **Quit Emberling** (closing the window keeps it running in the tray).
2. Download the latest `Emberling-Setup-x.y.z.exe` from [Releases](https://github.com/PiyushAnand2006/EmberLing/releases).
3. Run it — the NSIS installer detects the existing install and upgrades **in place** (same folder, same shortcuts). No uninstall needed first.
4. Launch from the desktop/start-menu shortcut. Your data (chats, bots, memories, keys) lives in `%APPDATA%\emberling` and is never touched by an update.

Check what changed on the [release notes](https://github.com/PiyushAnand2006/EmberLing/releases) page. If you're unsure which build you have: Settings → About shows the version.

**Portable users:** just download the new `Emberling-Portable-x.y.z.exe` and run it — replace the old file whenever you like; the two can coexist.

**From-source users:**

```powershell
git pull
npm install          # picks up any new dependencies
npm start            # rebuild + launch
```

**Rollback:** every release keeps its artifacts — grab any older `Emberling-Setup` from the releases list and install over the newer one to downgrade.

### Option B — From source (development)

```powershell
git clone https://github.com/PiyushAnand2006/EmberLing.git
cd EmberLing
npm install
npm start        # build renderer + launch electron
npm run dev      # hot-reload dev mode
```

Requires Node 18+ and npm. First run generates the icon set (`npm run icons` is pre-committed in `build/`).

---

## Commands

| Command | What it does |
|---|---|
| `npm start` | Build the renderer and launch the desktop app |
| `npm run dev` | Vite dev server + Electron with hot reload |
| `npm run build` | Build the renderer only (`renderer-build/`) |
| `npm run typecheck` | TypeScript strict check |
| `npm run icons` | Regenerate `build/icon.ico` + PNG sizes from `assets/brand/app-icon.svg` |
| `npm test` | Launch the app and run the three CDP suites (synthetic, real-click, menu) |
| `npm run pack` | Package unpacked (`release/win-unpacked/`) |
| `npm run dist` | Build NSIS installer + portable exe into `release/` |

---

## What's inside (feature walkthrough)

**Chat** — iMessage-style bubbles with 10 user colors, reactions (yours *and* the agent's via `react_to_message`), retry, copy, message editing with revision history, per-conversation drafts, offline queued sends (provider down → messages held with a "Send now" pill), unread badges, pin/mute/delete, full-text search.

**Composer** — markdown toolbar (bold/italic/code/link/lists/code block), slash commands (`/image`, `/video`, `/diagram`, `/chart`, `/preview`, `/search`, `/form`, `/teach`), file attachments, voice memos with playback + transcription, model picker, approval chip, bot selector.

**Agent tools (19)** — `run_command`, `read_file`, `write_file`, `edit_file`, `list_dir`, `web_search` (keyless), `web_fetch`, `generate_photo` (keyless), `generate_video` (keyless clips), `screenshot` (app), `screen_screenshot`, `spawn_subagent`, `request_user_form`, `react_to_message`, `send_email` (mailto + .eml draft), `list_windows`, `focus_window`, `type_text`, `save_memory`. Each is individually toggleable in Settings → General.

**MCP** — connect any stdio MCP server; discovered tools are injected into the agent turn automatically (named `mcp_<server>_<tool>`) and respect the approval mode.

**Rich blocks** — ```` ```mermaid ```` diagrams, ```` ```chart ```` (bar/line/pie SVG), ```` ```html ```` sandboxed previews, ```` ```clip ```` frame players; **docx** renders via mammoth, **xlsx** via SheetJS, **pdf** opens a viewer window.

**Bots** — personal + team bots with Dotling faces, instructions, knowledge files, **template export/import**, and **publishing**: any bot becomes a live web chat on your LAN (`http://<ip>:<port>/agent/<id>?token=…`) with access control — a real hosted agent, no cloud bill.

**Voice mode** — 📞 in the header: mic → Whisper transcription → agent → spoken reply. **Teach mode** — 🎓 records your screen as timed frames the agent learns a task from.

**Automations** — daily or every-N-minutes prompts that run head-first into their own conversation with a notification (never auto-approving privileged tools).

**Free providers** — Pollinations (keyless default), Groq (also powers Whisper), OpenRouter, Google Gemini, Cerebras, Mistral, or any OpenAI-compatible endpoint. Multiple keys = automatic failover between providers.

---

## Feature parity vs the original

| Feature | Original | EmberLing |
|---|---|---|
| iMessage-style chat, reactions, streaming | ✅ | ✅ |
| Status pills ("Working", "Reading a file"…) | ✅ | ✅ |
| Rich composer, attachments, voice memos | ✅ | ✅ |
| Message edit / drafts / queued sends | ✅ | ✅ |
| Agent: shell + files + web + images | ✅ | ✅ |
| Photo generation | ✅ (paid) | ✅ (keyless) |
| Video generation | ✅ (paid) | ✅ (keyless clips) |
| Screenshots (app + screen) | ✅ | ✅ |
| Subagents | ✅ | ✅ |
| User forms | ✅ | ✅ |
| Computer use (windows, keystrokes) | ✅ | ✅ |
| MCP servers | ✅ | ✅ (real stdio client) |
| Bots + knowledge + avatars | ✅ | ✅ (+ Dotlings) |
| Team bots | ✅ (cloud) | ✅ (local) |
| Bot templates / share | ✅ | ✅ (JSON + clipboard) |
| Publish agents to the web | ✅ (cloud) | ✅ (LAN-hosted) |
| Automations / routines | ✅ (cloud) | ✅ (local scheduler) |
| Memories | ✅ | ✅ (+ agent-written) |
| Voice calls | ✅ | ✅ (local voice mode) |
| Learn from demonstration | ✅ | ✅ (screen recording) |
| Docx/xlsx/pdf viewers | ✅ | ✅ |
| Mermaid/d3/three visualizations | ✅ | ✅ mermaid + charts |
| Desktop mark orb | ✅ | ✅ |
| Tray | ✅ | ✅ |
| i18n | ✅ 34 locales | ✅ 8 locales |
| Usage dashboard | ✅ | ✅ (local) |
| Slack/Teams/iMessage delivery | ✅ (backend) | ✅ (Slack API, Teams Graph, SMTP/IMAP; iMessage on macOS) |
| Cloud box ("On its computer") | ✅ | ✅ (SSH remote host) |
| Payments / upgrades | ✅ | ✨ free ("Emberling Plus") |

---

## Tests

Three CDP suites drive the real app end-to-end (launch → evaluate → real mouse events → assertions):

| Suite | Covers |
|---|---|
| `scripts/launch-and-test.mjs` | 20 synthetic-click checks across chat, composer, settings |
| `scripts/real-click-test.mjs` | 8 real-mouse click checks (hit-testing, overlays) |
| `scripts/menu-items-test.mjs` | menu selection, conversation menus, reactions |
| `scripts/feature-test.mjs` | publish server round-trip, mermaid rendering, MCP section |

Run with `npm test` (launches its own instance). The MCP client additionally has a scripted round-trip against `scripts/test-mcp-server.cjs` (connect → list → call → assert).

---

## Files

| Path | What it is |
|---|---|
| `electron/main.js` | Windows, tray, IPC, scheduler, usage, teach capture, integrations IPC |
| `electron/preload.js` | contextBridge surface (`window.emberling`) |
| `electron/agent.js` | Tool-calling turn loop (API + text-mode tool protocols) |
| `electron/tools.js` | 37 tool defs + dispatch + approval gating + remote/sandbox routing |
| `electron/sandbox.js` | Per-Dotling WSL Ubuntu VMs — isolated, approval-free execution |
| `electron/browser.js` | CDP control of the installed Chrome/Edge |
| `electron/agent-store.js` | Per-bot file store with version history |
| `electron/shell-runner.js` | Privileged shell execution (only spawn site) |
| `electron/remote.js` | SSH remote execution — "On its computer" |
| `electron/integrations/` | GitHub/GitLab/Bitbucket/Azure, Slack, Teams (Graph), iMessage, email (SMTP/IMAP), 1Password |
| `electron/integration-tools.js` | Section-A + workspace tools dispatched to the agent |
| `electron/plugins.js` | Plugin registry (built-in weather/places/currency + manifest installs) |
| `electron/contacts.js` `electron/calendar.js` `electron/skills.js` | Local address book, events + ICS, replayable procedures |
| `electron/computer-use.js` | Click/scroll/window automation (user32 P/Invoke) |
| `electron/secure-store.js` | DPAPI-encrypted secrets at rest |
| `electron/license.js` | Offline HMAC-signed Plus license keys |
| `electron/web-tools.js` | Keyless search / fetch / photo / video |
| `electron/providers.js` | Provider registry, streaming, fallback, self-heal, Whisper |
| `electron/mcp.js` | MCP stdio JSON-RPC client |
| `electron/publish.js` | LAN hosting for published bots |
| `electron/store.js` | Debounced JSON persistence in userData |
| `src/components/` | ChatView, Composer (TipTap), Sidebar, Markdown (mermaid/chart/graph/three/html/clip), AttachmentViewers, Menu, Icons, Brand |
| `src/screens/` | Settings, Bots, Memories, Automations+Calendar, Contacts, Integrations, Onboarding |
| `src/styles/tokens.css` | REA-extracted design tokens |
| `assets/brand/` | App icon SVG, mark, wordmark, Dotling characters |
| `build/` | Generated icon.ico / icon.png set |
| `docs/REA-FINDINGS.md` | The reverse-engineering evidence log |
| `docs/screenshots/` | All README screenshots |
| `scripts/` | Test suites, icon generator, capture tooling |

---

## Notes & ethics

- Everything stays on your machine: conversations, bots, memories, keys (`%APPDATA%\emberling\*.json`). Integration tokens are DPAPI-encrypted (device-bound). The only outbound traffic is to the AI provider you configure, the services you explicitly connect, and keyless public endpoints (DuckDuckGo, Pollinations, wttr.in, Nominatim, er-api).
- Shell commands are the agent's core capability (as in the original) but are user-approved by default, sandboxed to a non-interactive shell with no profile, delivered via a generated temp script file, and tied to the turn's abort signal. Remote ("On its computer") execution uses key-based SSH you configure.
- Published bots are token-gated and can be restricted to localhost.
- This project exists to document how a shipped agent app is put together. Please use it only where running an AI assistant is permitted, and don't pass it off as the original product.

## By-design exclusions (Block D)

These subsystems of the original are intentionally **not** replicated because they exist to serve the vendor, not the user:

- **Statsig feature flags / A-B experiments** — replaced by local defaults; no remote config, no experiment enrollment.
- **Sentry + OTLP telemetry pipelines** — removed entirely; errors go to the local console only.
- **Account-based gating calls home** (machine labels, roster checks, license servers) — Plus licensing is offline-verified HMAC instead.

Everything else from the original is either implemented (see the parity table above), locally re-imagined (Slack/Teams/Email via your own tokens, SSH instead of their cloud VM), or listed honestly as simulated.

## License

MIT — see [LICENSE](LICENSE).
