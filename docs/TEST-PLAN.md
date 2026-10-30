# Emberling — Master Test Plan

Every test case for the app, grouped by feature area. **Auto** = executed by `npm run test:suites` (`scripts/test-suites.mjs`), **Manual** = needs a human/credentials, **Skip** = backend-bound by design.

| Area | Cases |
|---|---|
| L — App lifecycle & shell | 14 |
| O — Onboarding | 5 |
| C — Chat & conversation | 18 |
| P — Composer | 12 |
| T — Agent tools & approvals | 24 |
| A — Cards, artifacts & canvas | 10 |
| B — Bots & orchestration | 10 |
| M — Automations & triggers | 14 |
| I — Integrations | 14 |
| R — Memories | 6 |
| V — Voice | 6 |
| D — Desktop orb & hover preview | 8 |
| S — Settings & providers | 14 |
| X — Security & reliability | 12 |
| U — Install & updates | 6 |
| G — i18n & UX polish | 8 |

Total: **181 cases**.

---

## L — App lifecycle & shell

| ID | Case | Expected | Auto |
|---|---|---|---|
| L1 | App launches (dev `electron .`) | Main window opens, renderer boots without exceptions | ✅ |
| L2 | Fresh profile → onboarding shows | "Meet Emberling" screen, provider list renders | ✅ |
| L3 | Second instance launched | First instance's window is focused, second exits | 👤 |
| L4 | Close (X) the window | App keeps running in tray ("keep running in tray like the original menubar agent") | 👤 |
| L5 | Tray menu lists recent chats | Up to 6 recent conversation titles, clickable → opens that chat | ✅ |
| L6 | Tray "New chat" | Opens main window on a new chat | 👤 |
| L7 | Tray "Hide/Show the desktop mark" | Orb window hides/shows, `showOrb` persisted | 👤 |
| L8 | Orb position persisted across restart | Orb reappears where dragged | ✅ |
| L9 | Window title follows active conversation | Title = chat title | ✅ |
| L10 | All screens render without console exceptions | Zero uncaught errors in 30s of navigation | ✅ |
| L11 | Renderer survives Ctrl+R reload | State re-read from store, no data loss | ✅ |
| L12 | `--user-data-dir` custom profile | App uses the given dir (isolated stores) | ✅ |
| L13 | Sidebar shows unreads/mute/pin states | Pinned first, muted bell, unread badge | ✅ |
| L14 | Quit from tray | All electron processes exit | 👤 |

## O — Onboarding

| ID | Case | Expected | Auto |
|---|---|---|---|
| O1 | Provider chips render (Pollinations/Groq/OpenRouter/Gemini/Cerebras/Mistral) | 6 chips, one preselected | ✅ |
| O2 | "Skip for now" | Lands on chat home, onboarding not shown again | ✅ |
| O3 | Pasting a Groq key + Start chatting | Key saved, chat home, model chip updates | 👤 |
| O4 | "Test key" with invalid key | Clear failure toast | 👤 |
| O5 | Completion sets `onboardingDone` | Onboarding skipped on next launch | ✅ |

## C — Chat & conversation

| ID | Case | Expected | Auto |
|---|---|---|---|
| C1 | Send a message | User bubble renders; streaming reply appears; status pill "Working" | 👤 |
| C2 | Stop during stream | Turn aborts, "Stopped." shown, no orphan tool calls | 👤 |
| C3 | Edit-and-resend | Prior turn aborted + unwound first (no 429 from overlap) | ✅ |
| C4 | Queued send while streaming | Message queues, sends after turn ends (`queueOffline`) | ✅ |
| C5 | Transcript search (Search chats) | Filters conversations by content | ✅ |
| C6 | Pin a conversation | Sorts to pinned group, persists | ✅ |
| C7 | Mute a conversation | Bell icon toggles, unread counter suppressed | ✅ |
| C8 | Unread badge on new content | Badge count renders, clears on open | ✅ |
| C9 | Chat export | Markdown file saved via save dialog | 👤 |
| C10 | Slash commands | `/` opens menu, filter works, insert applies | ✅ |
| C11 | Attachments (files) | Attachment cards render, uploadable to turn | ✅ |
| C12 | Voice memo bubble | Records, renders with duration + transcript | 👤 |
| C13 | Reactions on bubbles | Reaction picker, emoji persisted | ✅ |
| C14 | Empty state | Greeting + 4 suggestion chips, composer focused | ✅ |
| C15 | Conversation title from first message | Title truncates to sidebar width | ✅ |
| C16 | Delete conversation | Removed from list + store | ✅ |
| C17 | Automation chat shows `automation:true` messages | Dedicated chat per automation | ✅ |
| C18 | Markdown round-trip | Paste markdown → rich; send → markdown (turndown) | ✅ |

## P — Composer

| ID | Case | Expected | Auto |
|---|---|---|---|
| P1 | Pill layout | `+` hub → editor (stretches) → chips + mic at **right edge** | ✅ |
| P2 | Placeholder "Ask anything" / per-bot | Correct placeholder text | ✅ |
| P3 | TipTap rich editing | Bold/italic/lists round-trip to markdown | ✅ |
| P4 | Model chip | Shows `provider · model`, opens picker, selection persists | ✅ |
| P5 | Approval chip | Ask before acting / Ask for risky / Act automatically | ✅ |
| P6 | Send button swaps with mic when text present | Correct button per state | ✅ |
| P7 | Stop button while busy | Replaces send, aborts turn | ✅ |
| P8 | Recording timer | "X.Xs" counter while recording | 👤 |
| P9 | Composer actions (+) menu | Attach files / voice memo / teach a task | ✅ |
| P10 | Enter sends, Shift+Enter newline | Correct key handling | ✅ |
| P11 | Chips never wrap the badge/title | White-space nowrap holds at narrow widths | ✅ |
| P12 | Slash-menu closes on blur/escape | No stuck overlay | ✅ |

## T — Agent tools & approvals

| ID | Case | Expected | Auto |
|---|---|---|---|
| T1 | `run_command` in "Ask before acting" | Approval card, runs only after approve | ✅ |
| T2 | Risky command (`rm`, `format`, `sudo`…) flagged by RISKY_RE | Forced approval even in askRisky | ✅ |
| T3 | `read_file` / `write_file` / `edit_file` / `list_dir` | Correct results, status pills shown | ✅ |
| T4 | `web_search` | Results from DuckDuckGo HTML | ✅ |
| T5 | `web_fetch` on public URL | Content fetched; private IP blocked (assertPublicHttpUrl) | ✅ |
| T6 | `generate_photo` | Image URL returned, photo card renders | 👤 |
| T7 | `generate_video` | Frame URLs + clip player | 👤 |
| T8 | `screenshot` (app window) | emberling-media:// URL, image embeds | ✅ |
| T9 | `screen_screenshot` | Full-display capture via desktopCapturer | ✅ |
| T10 | `window_screenshot` partial title | Captures matching window even when covered | ✅ |
| T11 | `window_screenshot` WGC flake → PrintWindow fallback | Still succeeds (never relies on WGC alone) | ✅ |
| T12 | `window_screenshot` no match | Lists visible window names in the error | ✅ |
| T13 | `ocr_image` on a known image | Exact text returned with line breaks | ✅ |
| T14 | `ocr_image` missing file / bad ext / no arg | Clean errors, no crash | ✅ |
| T15 | `ocr_image` on non-Windows | Clear platform message | ✅ |
| T16 | `spawn_subagent` | Subagent runs web+read-only, returns summary | 👤 |
| T17 | `request_user_form` | Form card renders, answers returned | 👤 |
| T18 | `send_email` | mailto opens + .eml draft in Downloads | 👤 |
| T19 | `react_to_message` | Emoji reaction applied | ✅ |
| T20 | `save_memory` | Memory stored, appears in Memories screen | ✅ |
| T21 | `store_write/read/list/search/versions/delete` | KV store round-trips | ✅ |
| T22 | `link_preview` | Preview card data | ✅ |
| T23 | MCP server tools | Listed, callable, restart/instructions honored | 👤 |
| T24 | Tool toggles in Settings gate tools | Disabled tool is absent from the turn's tool list | ⚠️ (migration re-adds new tools — known quirk) |

## A — Cards, artifacts & canvas

| ID | Case | Expected | Auto |
|---|---|---|---|
| A1 | Mermaid block renders to SVG | Diagram visible, error shown for bad syntax | ✅ |
| A2 | `chart` block (bar/line/pie/donut) | SVG chart from JSON spec | ✅ |
| A3 | `graph` block (cytoscape) | Nodes/edges laid out | ✅ |
| A4 | `three` block | 3D scene with orbit controls | 👤 |
| A5 | `html`/`preview` block | Sandboxed HTML preview | ✅ |
| A6 | `clip` block | Frame-sequence player | 👤 |
| A7 | Code block copy button | Copies to clipboard | ✅ |
| A8 | File cards (pdf/xlsx/docx viewers) | Open in viewer window | 👤 |
| A9 | Canvas pop-out | Detaches to its own window | 👤 |
| A10 | KaTeX math | Rendered inline/block | ✅ |

## B — Bots & orchestration

| ID | Case | Expected | Auto |
|---|---|---|---|
| B1 | Create bot (name/emoji/instructions) | Persists, appears in sidebar switcher | ✅ |
| B2 | Knowledge files | Added/removed, injected into bot turns | ✅ |
| B3 | Bot avatar editor | Custom face renders | 👤 |
| B4 | Templates | Import/share links work | 👤 |
| B5 | Publish flow | Public URL, access controls, live preview | 👤 |
| B6 | Chat with a bot | Bot instructions + knowledge applied | ✅ |
| B7 | Per-Dotling virtual screen | Screen panel shows trail while acting | ✅ |
| B8 | `send_message` to another bot (rooms) | Target bot replies with its own knowledge | 👤 |
| B9 | Room delegation depth cap | No infinite bot-to-bot loops | 👤 |
| B10 | Bots screen sections render | Team/templates/publish tabs intact | ✅ |

## M — Automations & triggers

| ID | Case | Expected | Auto |
|---|---|---|---|
| M1 | Create automation (schedule daily/minutes) | Saved, listed with schedule summary | ✅ |
| M2 | Schedule fires (minutes) | Run lands in its own chat, `lastRun` bumps | ✅ |
| M3 | Daily schedule | Fires at/after the set time, weekdays filter | ✅ |
| M4 | Missed schedule catch-up on launch | Runs once on next start | ✅ |
| M5 | Trigger select: 3 options | Schedule / Slack mention / GitHub repo event | ✅ |
| M6 | Slack trigger conditional UI | Channel dropdown; honest error without token | ✅ |
| M7 | Slack trigger fires on mention (live) | Mention message appended to prompt | ⚠️ needs Slack token |
| M8 | GitHub trigger conditional UI | owner/repo + event select + note | ✅ |
| M9 | GitHub trigger fires on new issue/PR (live) | Event appended; agent turn completes | ✅ |
| M10 | First poll baselines only | Connecting never replays history | ✅ |
| M11 | "Check now" force-fires newest event | Verifies wiring without waiting | ✅ |
| M12 | Run appears live in sidebar (no reload) | Push/merge delivers conversation + unread badge | ✅ |
| M13 | Webhook trigger | Loopback URL + key auth; wrong key → 401 | ✅ |
| M14 | Delete automation | Removed; its chat remains | ✅ |

## I — Integrations

| ID | Case | Expected | Auto |
|---|---|---|---|
| I1 | Card grid renders | 14 cards, icon tiles, one-line badges, equal row heights | ✅ |
| I2 | Real connectors show token inputs + "Get one free" links | GitHub/GitLab/Bitbucket/Azure/Slack/Email | ✅ |
| I3 | 5 Vendor OAuth stubs | Linear/Zoom/Google/Entra/SharePoint, warn badge, per-card reason | ✅ |
| I4 | GitHub PAT connect | "Testing…" → repo list sample → Connected badge | ⚠️ needs token |
| I5 | Slack bot token connect | auth.test team/user shown | ⚠️ needs token |
| I6 | Teams device-code flow | Code shown, poll completes, signed-in state | ⚠️ needs tenant |
| I7 | Email SMTP/IMAP save | Presets (Gmail) fill; connect stores DPAPI-encrypted | 👤 |
| I8 | 1Password CLI detection | `op` found → Connected; absent → install link | ✅ |
| I9 | iMessage platform gating | Non-macOS shows clear platform message | ✅ |
| I10 | Tokens DPAPI-encrypted at rest | Store file contains `enc:` blobs, not plaintext | ✅ |
| I11 | Remote computer (SSH) card | Full width; keygen/test/execute buttons | ✅ |
| I12 | Remote execution flip | Tools run on remote; approval cards say so | 👤 |
| I13 | Footer note explains stubs | Mentions vendor-hosted backends | ✅ |
| I14 | Connected state border + badge | Green border + Connected badge after connect | 👤 |

## R — Memories

| ID | Case | Expected | Auto |
|---|---|---|---|
| R1 | `save_memory` tool adds memory | Appears in list | ✅ |
| R2 | Memories injected into every turn | Agent follows them | ✅ |
| R3 | Export as markdown | .md file via save dialog | 👤 |
| R4 | Never-save-passwords rule | Agent refuses to store secrets | ✅ |
| R5 | Delete memory | Removed from list + store | ✅ |
| R6 | Memories screen copy states the rule | "never stores passwords or API keys" | ✅ |

## V — Voice

| ID | Case | Expected | Auto |
|---|---|---|---|
| V1 | Voice mode call | Hands-free conversation, silence detection ends turns | 👤 |
| V2 | Transcription (Whisper via Groq) | Memo → text | ⚠️ needs key |
| V3 | Mic permission / device selection | Voice settings honored | 👤 |
| V4 | Voice rate setting | Playback rate applied | 👤 |
| V5 | Voice memo in chat | Plays inline with duration | 👤 |
| V6 | Graceful failure without key | Clear message, no crash | ✅ |

## D — Desktop orb & hover preview

| ID | Case | Expected | Auto |
|---|---|---|---|
| D1 | Orb visible, always-on-top | Shows on all workspaces | ✅ |
| D2 | Drag moves the window | Custom pointer tracking, position saved | 👤 |
| D3 | Click opens Emberling | focusMain | ✅ |
| D4 | File drop attaches to a chat | Files handed to main window | 👤 |
| D5 | Hover (300ms) shows preview bubble | Glass bubble above orb, latest chat title+snippet | ✅ |
| D6 | Bubble is click-through | Never steals clicks | ✅ |
| D7 | Bubble hides on leave / drag / orb hide | No stale bubble | ✅ |
| D8 | `--orb-preview-test` flashes the bubble | Visual verification without hover | ✅ |

## S — Settings & providers

| ID | Case | Expected | Auto |
|---|---|---|---|
| S1 | Sections render | General/Account/Notifications/Appearance/Voice/About + Bots/Memories/Integrations screens | ✅ |
| S2 | Add provider key + Test | Success/failure toast | ⚠️ needs key |
| S3 | Multi-provider fallback | Next provider tried on failure (orderedConfigs) | ✅ |
| S4 | Models fetch (non-keyless) | Remote catalog merged into picker | ⚠️ |
| S5 | Approval mode selector | Persists; drives tool approvals | ✅ |
| S6 | Auto-review rules | allow/deny/ask per tool pattern; first match wins | ✅ |
| S7 | Agent tool chips | Toggle adds/removes id from agentTools | ✅ |
| S8 | 34-locale i18n | Language switch re-renders UI | 👤 |
| S9 | Usage stats | Per-provider counters update | ✅ |
| S10 | Appearance | Accent/theme tokens applied | 👤 |
| S11 | Plus licensing | Valid offline key activates tier; invalid rejected | ✅ |
| S12 | Notification settings | Toasts on/off honored | 👤 |
| S13 | Keyless provider needs no key | activeConfig falls back to "free" | ✅ |
| S14 | Settings push after orb toggle | Renderer state syncs | ✅ |

## X — Security & reliability

| ID | Case | Expected | Auto |
|---|---|---|---|
| X1 | DPAPI encryption at rest | Secrets stored as `enc:` blobs | ✅ |
| X2 | Keyless serialization | N concurrent streams → sequential, zero 429 | ✅ |
| X3 | 429 RATE_LIMITED retry ladder | 5s/15s/30s before failing over | ✅ |
| X4 | Store push/merge no clobber | Headless runs survive renderer persists | ✅ |
| X5 | Merge identity preservation | Echo pushes don't loop (renderer stays responsive) | ✅ |
| X6 | Self-protection firewall (guard.js) | Dangerous self-modifications blocked | 👤 |
| X7 | Sandbox/WSL detection | Per-scope distro cloning works | 👤 |
| X8 | web_fetch blocks private IPs | SSRF guard | ✅ |
| X9 | Webhook key required | Missing/wrong key → 401 | ✅ |
| X10 | File downloads/paths sanitized | No arbitrary write outside media dir | ✅ |
| X11 | No plaintext keys in logs | Providers log messages, not secrets | ✅ |
| X12 | CSP headers on windows | Default-src 'self' enforced | ✅ |

## U — Install & updates

| ID | Case | Expected | Auto |
|---|---|---|---|
| U1 | `npm run dist` builds Setup + Portable + latest.yml | All artifacts, correct version | ✅ |
| U2 | latest.yml matches artifacts (sha512/size) | electron-updater can verify | ✅ |
| U3 | GitHub release published with all assets | Release page complete | ✅ |
| U4 | In-app update check | "Restart to update" banner on newer release | 👤 |
| U5 | install.ps1 resolves latest version via API | Installs newest release | ✅ |
| U6 | Portable build runs standalone | No install required | 👤 |

## G — i18n & UX polish

| ID | Case | Expected | Auto |
|---|---|---|---|
| G1 | Language switch (34 locales) | Menus/screens translate | 👤 |
| G2 | Badges never wrap to two lines | `white-space: nowrap` | ✅ |
| G3 | Card grid rows equal height | Stretch + bottom-anchored actions | ✅ |
| G4 | Bubble max-width 640px | Long messages wrap, not stretch | ✅ |
| G5 | Dark tokens match REA spec | #141414 chrome, #f54e00 brand | ✅ |
| G6 | Long titles truncate with ellipsis | Sidebar/chat header | ✅ |
| G7 | Toasts stack and auto-dismiss | 2.6s, no overlap | ✅ |
| G8 | Empty states for all screens | Helpful copy, no blank panels | ✅ |

---

## Automation coverage summary

- ✅ Executable now: `npm run test:suites` (static/consistency + module + launch smoke) — ~60 assertions
- ⚠️ Need credentials/external services: Slack, Teams, provider keys, transcription
- 👤 Manual: drag/paint/audio/approval-card flows
