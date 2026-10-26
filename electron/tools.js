// Agent tools — the local execution surface (original: local-exec-daemon).
// Tool dispatch, approval gating, and result shaping. Privileged shell
// execution lives in shell-runner.js (the only spawn site, invoked strictly
// after user approval). Web search uses DuckDuckGo's HTML endpoint (no key);
// photo generation uses Pollinations (free, no key).

const fsp = require("node:fs/promises");
const path = require("node:path");
const { runShellScript, validateScript } = require("./shell-runner");
const { runRemoteScript } = require("./remote");
const computerUse = require("./computer-use");

const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command on the user's computer and return stdout/stderr (truncated to ~6000 chars). Use for builds, git, file inspection scripts, etc. Commands require user approval unless the approval mode allows them.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run" },
          cwd: { type: "string", description: "Working directory (default: user home)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file from the user's computer. Returns the content (truncated to ~20000 chars).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write (create or overwrite) a text file on the user's computer.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
          content: { type: "string", description: "Full file content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace the first occurrence of exact text inside a file. Prefer this over write_file for small edits.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_text: { type: "string", description: "Exact text to find" },
          new_text: { type: "string", description: "Replacement text" },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List entries of a directory with sizes and types.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Absolute directory path" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web (DuckDuckGo) and return the top results: title, url, snippet.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch a URL and return readable text content (HTML stripped, truncated to ~12000 chars).",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_photo",
      description:
        "Generate a photo/image from a text prompt (free Pollinations endpoint, no key). Returns a public image URL to embed as markdown.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed visual description of the image" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screenshot",
      description:
        "Capture a screenshot of the Emberling app window and return a emberling-media:// URL to embed as markdown. Useful to show the user what you see or built.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_subagent",
      description:
        "Spawn a focused subagent (web + read-only tools) to research or verify something in the background and return its summary. Use for parallelizable research you don't need step-by-step visibility into.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "One-sentence task for the subagent" },
        },
        required: ["goal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "react_to_message",
      description: "Add an emoji reaction to the user's latest message in this chat.",
      parameters: {
        type: "object",
        properties: { emoji: { type: "string", description: "A single emoji, e.g. 👍" } },
        required: ["emoji"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_user_form",
      description:
        "Ask the user structured questions with a form card in the chat (text fields, selects, checkboxes). Use when you need several inputs before acting.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          fields: {
            type: "array",
            description: "Form fields",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                type: { type: "string", description: "'text' | 'select' | 'checkbox'" },
                options: { type: "array", items: { type: "string" }, description: "choices for 'select'" },
                placeholder: { type: "string" },
              },
              required: ["label", "type"],
            },
          },
        },
        required: ["title", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description:
        "Compose an email: opens the user's default mail client pre-filled and saves a .eml draft to their Downloads folder.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_video",
      description:
        "Generate a short animated clip from a prompt (free keyless endpoint): renders a seeded frame sequence and returns frame URLs plus markdown to embed the clip player.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description of the motion/scene" },
          frames: { type: "number", description: "Frame count 3-8 (default 5)" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_windows",
      description: "List the titles of currently open application windows on the user's computer (computer use).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "focus_window",
      description: "Bring an application window to the foreground by (partial) title (computer use). Requires approval.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "Type text / keystrokes into the focused application (computer use). Requires approval.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to type (SendKeys syntax, e.g. {ENTER}, ^s)" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screen_screenshot",
      description: "Capture a full-screen screenshot of the user's primary display (computer use) and return a emberling-media:// URL.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Save a durable fact/preference about the user to Memories (followed in all future chats). Never save passwords, API keys or secrets.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screen_click",
      description:
        "Computer use: move the mouse to screen coordinates (x,y) and click. Use screen_screenshot + window rects to find coordinates first. Requires approval.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          button: { type: "string", description: "'left' (default) or 'right'" },
          double: { type: "boolean", description: "double-click" },
        },
        required: ["x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screen_scroll",
      description: "Computer use: scroll the mouse wheel up/down by a number of notches. Requires approval.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", description: "'up' or 'down'" },
          amount: { type: "number", description: "notches, 1-10" },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_window_rect",
      description:
        "Computer use: bring a window to the foreground by (partial) title and return its screen rectangle — useful to pick click coordinates inside it. Requires approval.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
  },
];

const NEEDS_APPROVAL = new Set(["run_command", "write_file", "edit_file", "focus_window", "type_text", "screen_click", "screen_scroll", "get_window_rect"]);
const RISKY_RE = /rm\s|del\s|format|sudo|remove-item/i;

const { webSearch, webFetch, generatePhoto, truncate } = require("./web-tools");

function toolsRequiringApproval(name) {
  return NEEDS_APPROVAL.has(name);
}

async function listDir(p) {
  const entries = await fsp.readdir(p, { withFileTypes: true });
  const rows = [];
  for (const e of entries.slice(0, 500)) {
    let size = "";
    try {
      const st = await fsp.stat(path.join(p, e.name));
      size = st.isDirectory() ? "dir" : `${st.size}`;
    } catch {
      size = "?";
    }
    rows.push(`${e.isDirectory() ? "d" : "-"} ${String(size).padStart(9)} ${e.name}`);
  }
  return rows.join("\n") || "(empty)";
}

// Execute a tool call. `approve(toolCall)` resolves true/false and lets the
// renderer surface the original's approval card UX before anything privileged
// runs (see shell-runner's security contract).
async function executeTool(call, ctx) {
  const { name, args } = call;
  const signal = ctx.signal;
  try {
    switch (name) {
      case "run_command": {
        const script = validateScript(args.command);
        const remote = ctx.getRemote?.();
        const needsApproval =
          ctx.approvalMode === "ask" ||
          (ctx.approvalMode === "askRisky" && RISKY_RE.test(script));
        if (needsApproval) {
          const ok = await ctx.approve({ tool: name, title: remote?.enabled ? "Run a command on the remote computer" : "Run a command on your computer", detail: script, kind: "command" });
          if (!ok) return { ok: false, error: "User declined to run this command." };
        }
        if (remote?.enabled) {
          const res = await runRemoteScript({ ...remote, script, cwd: args.cwd });
          return { ok: true, ...res };
        }
        return await runShellScript({ script, cwd: args.cwd, signal });
      }
      case "read_file": {
        const remote = ctx.getRemote?.();
        if (remote?.enabled) {
          const res = await runRemoteScript({ ...remote, script: `cat ${JSON.stringify(String(args.path))}` });
          return res.exitCode === 0 ? { ok: true, content: res.stdout.slice(0, 20000) } : { ok: false, error: (res.stderr || `exit ${res.exitCode}`).slice(0, 300) };
        }
        const content = await fsp.readFile(args.path, "utf8");
        return { ok: true, content: truncate(content, 20000) };
      }
      case "write_file": {
        const ok = await ctx.approve({ tool: name, title: "Write a file", detail: `${args.path}\n(${(args.content || "").length} bytes)`, kind: "write" });
        if (!ok) return { ok: false, error: "User declined this file write." };
        const remote = ctx.getRemote?.();
        if (remote?.enabled) {
          const heredoc = `cat > ${JSON.stringify(String(args.path))} << 'EMBERLING_EOF'\n${String(args.content ?? "")}\nEMBERLING_EOF\n`;
          const res = await runRemoteScript({ ...remote, script: heredoc });
          return res.exitCode === 0 ? { ok: true, wrote: `remote:${args.path}` } : { ok: false, error: (res.stderr || `exit ${res.exitCode}`).slice(0, 300) };
        }
        await fsp.mkdir(path.dirname(args.path), { recursive: true });
        await fsp.writeFile(args.path, args.content ?? "", "utf8");
        return { ok: true, wrote: args.path };
      }
      case "edit_file": {
        const ok = await ctx.approve({ tool: name, title: "Edit a file", detail: args.path, kind: "edit" });
        if (!ok) return { ok: false, error: "User declined this file edit." };
        const original = await fsp.readFile(args.path, "utf8");
        if (!original.includes(args.old_text)) return { ok: false, error: "old_text not found in file" };
        const next = original.replace(args.old_text, args.new_text ?? "");
        await fsp.writeFile(args.path, next, "utf8");
        return { ok: true, edited: args.path };
      }
      case "list_dir": {
        const remote = ctx.getRemote?.();
        if (remote?.enabled) {
          const res = await runRemoteScript({ ...remote, script: `ls -la ${JSON.stringify(String(args.path))}` });
          return res.exitCode === 0 ? { ok: true, entries: res.stdout.slice(0, 8000) } : { ok: false, error: (res.stderr || `exit ${res.exitCode}`).slice(0, 300) };
        }
        return { ok: true, entries: await listDir(args.path) };
      }
      case "web_search":
        if (!String(args.query || "").trim()) return { ok: false, error: "web_search needs a non-empty 'query' string argument." };
        return { ok: true, results: await webSearch(args.query) };
      case "web_fetch":
        if (!/^https?:\/\//i.test(String(args.url || ""))) return { ok: false, error: "web_fetch needs a full http(s) 'url' argument." };
        return { ok: true, content: await webFetch(args.url) };
      case "generate_photo":
        return await generatePhoto(args.prompt);
      case "screenshot": {
        if (typeof ctx.takeScreenshot !== "function") return { ok: false, error: "screenshot unavailable" };
        return await ctx.takeScreenshot();
      }
      case "generate_video": {
        const { generateVideo } = require("./web-tools");
        return await generateVideo(args.prompt, Math.min(8, Math.max(3, Number(args.frames) || 5)));
      }
      case "spawn_subagent": {
        if (typeof ctx.spawnSubagent !== "function") return { ok: false, error: "subagents unavailable" };
        return await ctx.spawnSubagent(String(args.goal || ""));
      }
      case "react_to_message": {
        if (typeof ctx.uiAction !== "function") return { ok: false, error: "reactions unavailable" };
        ctx.uiAction({ type: "react", emoji: String(args.emoji || "👍").slice(0, 8) });
        return { ok: true, reacted: String(args.emoji || "👍").slice(0, 8) };
      }
      case "request_user_form": {
        if (typeof ctx.requestForm !== "function") return { ok: false, error: "forms unavailable" };
        const fields = Array.isArray(args.fields) ? args.fields.slice(0, 8) : [];
        if (!fields.length) return { ok: false, error: "no fields" };
        return await ctx.requestForm({ title: String(args.title || "A few questions"), fields });
      }
      case "send_email": {
        const to = String(args.to || "");
        const subject = String(args.subject || "");
        const body = String(args.body || "");
        const { shell } = require("electron");
        const os2 = require("node:os");
        const safeSubject = subject.replace(/[\r\n]+/g, " ");
        await shell.openExternal(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(safeSubject)}&body=${encodeURIComponent(body)}`);
        const draft = path.join(os2.homedir(), "Downloads", `emberling-draft-${Date.now()}.eml`);
        const eml = `To: ${to}\nSubject: ${safeSubject}\nDate: ${new Date().toUTCString()}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\n${body}\n`;
        await fsp.writeFile(draft, eml, "utf8");
        return { ok: true, opened: "default mail client", draftSaved: draft };
      }
      case "list_windows": {
        const isWin = process.platform === "win32";
        const script = isWin
          ? "Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty MainWindowTitle"
          : "wmctrl -l 2>/dev/null | cut -d' ' -f4- || echo '(install wmctrl for window listing)'";
        const res = await runShellScript({ script });
        return { ok: res.exitCode === 0, windows: (res.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 40) };
      }
      case "focus_window":
      case "type_text": {
        if (process.platform !== "win32") return { ok: false, error: "window control is currently supported on Windows only" };
        const script =
          name === "focus_window"
            ? `$w = New-Object -ComObject WScript.Shell; $procs = Get-Process | Where-Object { $_.MainWindowTitle -like '*${String(args.title || "").replace(/'/g, "''")}*' }; if ($procs) { $w.AppActivate($procs[0].Id) | Out-Null; 'focused: ' + $procs[0].MainWindowTitle } else { 'no matching window' }`
            : `$w = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 200; $w.SendKeys('${String(args.text || "").replace(/'/g, "''")}'); 'typed'`;
        const detail = name === "focus_window" ? `Focus window: ${args.title}` : `Type: ${args.text}`;
        if (ctx.approvalMode === "ask" || ctx.approvalMode === "askRisky") {
          const ok = await ctx.approve({ tool: name, title: "Computer use", detail, kind: "computer-use" });
          if (!ok) return { ok: false, error: "User declined this computer-use action." };
        }
        const res = await runShellScript({ script, signal });
        return { ok: res.exitCode === 0, result: res.stdout || res.stderr };
      }
      case "screen_screenshot": {
        if (typeof ctx.takeScreenScreenshot !== "function") return { ok: false, error: "screen capture unavailable" };
        return await ctx.takeScreenScreenshot();
      }
      case "screen_click": {
        if (!computerUse.isSupported) return { ok: false, error: "input automation is Windows-only in this build" };
        if (ctx.approvalMode === "ask" || ctx.approvalMode === "askRisky") {
          const ok = await ctx.approve({ tool: name, title: "Computer use", detail: `Click at (${args.x}, ${args.y})${args.double ? " (double)" : ""}${args.button === "right" ? " right button" : ""}`, kind: "computer-use" });
          if (!ok) return { ok: false, error: "User declined this computer-use action." };
        }
        return await computerUse.clickAt(args.x, args.y, args.button, args.double);
      }
      case "screen_scroll": {
        if (!computerUse.isSupported) return { ok: false, error: "input automation is Windows-only in this build" };
        if (ctx.approvalMode === "ask" || ctx.approvalMode === "askRisky") {
          const ok = await ctx.approve({ tool: name, title: "Computer use", detail: `Scroll ${args.direction || "down"} ×${args.amount || 3}`, kind: "computer-use" });
          if (!ok) return { ok: false, error: "User declined this computer-use action." };
        }
        return await computerUse.scroll(args.direction, args.amount);
      }
      case "get_window_rect": {
        if (!computerUse.isSupported) return { ok: false, error: "input automation is Windows-only in this build" };
        if (ctx.approvalMode === "ask" || ctx.approvalMode === "askRisky") {
          const ok = await ctx.approve({ tool: name, title: "Computer use", detail: `Focus and measure window: ${args.title}`, kind: "computer-use" });
          if (!ok) return { ok: false, error: "User declined this computer-use action." };
        }
        return await computerUse.windowRect(args.title);
      }
      case "save_memory": {
        if (typeof ctx.saveMemory !== "function") return { ok: false, error: "memories unavailable" };
        return await ctx.saveMemory(String(args.text || "").slice(0, 500));
      }
      default: {
        // MCP tools are named mcp_<server>_<tool>
        if (name.startsWith("mcp_") && typeof ctx.callMcp === "function") {
          const target = ctx.callMcp(name);
          if (target) {
            const mcp = require("./mcp");
            return await mcp.callTool(target.server, target.tool, args);
          }
        }
        return { ok: false, error: `Unknown tool: ${name}` };
      }
    }
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return { ok: false, error: String(err?.message || err) };
  }
}

const STATUS_BY_TOOL = {
  run_command: "Running a command",
  read_file: "Reading a file",
  write_file: "Drafting the file",
  edit_file: "Drafting the file",
  list_dir: "Reading a file",
  web_search: "Searching the web",
  web_fetch: "Reading the web",
  generate_photo: "Generating a photo",
  generate_video: "Generating a video",
  screenshot: "Taking a screenshot",
  screen_screenshot: "Taking a screenshot",
  spawn_subagent: "Working with a subagent",
  react_to_message: "Reacting",
  request_user_form: "Waiting for you",
  send_email: "Drafting an email",
  list_windows: "Looking at your windows",
  focus_window: "Using your computer",
  type_text: "Using your computer",
  screen_click: "Using your computer",
  screen_scroll: "Using your computer",
  get_window_rect: "Using your computer",
  save_memory: "Saving a memory",
};

module.exports = { TOOL_DEFS, executeTool, STATUS_BY_TOOL, toolsRequiringApproval, webSearch, webFetch };
