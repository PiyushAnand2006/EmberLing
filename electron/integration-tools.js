// Section-A agent tools: repo connectors, Slack, Teams, iMessage, email,
// 1Password — plus remote-target reporting. Tokens/config come from the
// encrypted integrations store via ctx passed from main.js (never from the
// model), so the model can use but never exfiltrate credentials.
const repos = require("./integrations/repos");
const slackApi = require("./integrations/slack");
const teamsApi = require("./integrations/teams");
const imessageApi = require("./integrations/imessage");
const emailApi = require("./integrations/email");
const opvault = require("./integrations/opvault");
const contacts = require("./contacts");
const calendar = require("./calendar");
const skillsStore = require("./skills");

function def(name, description, params) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties: params || {}, required: [] },
    },
  };
}
const req = (d, fields) => {
  d.function.parameters.required = fields;
  return d;
};
const str = (description) => ({ type: "string", description });

const TOOL_DEFS = [
  req(def("gh_repos", "List the user's GitHub repositories (PAT required)."), []),
  req(def("gh_read_file", "Read a file from a GitHub repo.", { repo: str("'owner/name'"), path: str("file path in the repo"), ref: str("optional branch/tag") }), ["repo", "path"]),
  req(def("gh_write_file", "Create or update a file in a GitHub repo (commits via API).", { repo: str("'owner/name'"), path: str("file path"), content: str("full file content"), branch: str("optional branch"), message: str("commit message") }), ["repo", "path", "content"]),
  req(def("gh_issues", "List GitHub issues for a repo.", { repo: str("'owner/name'"), state: str("'open'|'closed'|'all'") }), ["repo"]),
  req(def("gh_create_issue", "Create a GitHub issue.", { repo: str("'owner/name'"), title: str("issue title"), body: str("issue body") }), ["repo", "title"]),
  req(def("gh_pulls", "List GitHub pull requests for a repo.", { repo: str("'owner/name'") }), ["repo"]),
  req(def("gh_pr_comment", "Comment on a GitHub pull request or issue.", { repo: str("'owner/name'"), number: { type: "number" }, body: str("comment text") }), ["repo", "number", "body"]),
  req(def("gl_projects", "List the user's GitLab projects (PAT required)."), []),
  req(def("gl_read_file", "Read a file from a GitLab project.", { project: str("'group/project'"), path: str("file path"), ref: str("optional ref, default main") }), ["project", "path"]),
  req(def("gl_issues", "List GitLab issues for a project.", { project: str("'group/project'") }), ["project"]),
  req(def("gl_create_issue", "Create a GitLab issue.", { project: str("'group/project'"), title: str("title"), body: str("description") }), ["project", "title"]),
  req(def("bb_repos", "List the user's Bitbucket repositories (app-password as 'email:password' required)."), []),
  req(def("bb_read_file", "Read a file from a Bitbucket repository.", { repo: str("'workspace/repo'"), path: str("file path"), ref: str("optional branch, default main") }), ["repo", "path"]),
  req(def("az_projects", "List Azure DevOps projects (PAT + organization configured in Integrations)."), []),
  req(def("az_read_file", "Read a file from an Azure DevOps git repo.", { project: str("project name"), repo: str("repo name"), path: str("file path"), ref: str("optional branch") }), ["project", "repo", "path"]),
  req(def("slack_channels", "List Slack channels the bot can see."), []),
  req(def("slack_send", "Send a message to a Slack channel (id from slack_channels).", { channel: str("channel id e.g. C0123ABCD"), text: str("message text") }), ["channel", "text"]),
  req(def("slack_react", "Add a reaction to a Slack message.", { channel: str("channel id"), timestamp: str("message ts"), emoji: str("emoji name e.g. thumbsup") }), ["channel", "timestamp", "emoji"]),
  req(def("slack_history", "Read recent messages from a Slack channel.", { channel: str("channel id"), limit: { type: "number" } }), ["channel"]),
  req(def("slack_search", "Search messages across the user's Slack workspace.", { query: str("search query") }), ["query"]),
  req(def("teams_me", "Get the signed-in Microsoft account for Teams."), []),
  req(def("teams_chats", "List recent Teams/group chats."), []),
  req(def("teams_send", "Send a message to a Teams chat (id from teams_chats).", { chatId: str("chat id"), text: str("message text") }), ["chatId", "text"]),
  req(def("teams_history", "Read recent messages from a Teams chat.", { chatId: str("chat id") }), ["chatId"]),
  req(def("imessage_send", "Send an iMessage (macOS only).", { to: str("phone number or Apple ID email"), text: str("message text") }), ["to", "text"]),
  req(def("imessage_recent", "Read recent iMessages from an open chat (macOS only).", { chatGuid: str("optional chat guid"), limit: { type: "number" } }), []),
  req(def("email_send", "Send an email via the configured SMTP account.", { to: str("recipient address"), subject: str("subject"), body: str("plain-text body"), cc: str("optional cc") }), ["to", "subject", "body"]),
  req(def("email_search", "Search the configured IMAP inbox (subject match, last 30 days).", { query: str("subject text to find"), mailbox: str("optional mailbox, default INBOX"), limit: { type: "number" } }), ["query"]),
  req(def("email_read", "Read an email by uid (from email_search).", { uid: { type: "number" }, mailbox: str("optional mailbox") }), ["uid"]),
  req(def("op_items", "List 1Password items (op CLI must be installed and signed in).", { vault: str("optional vault name") }), []),
  req(def("op_read", "Read a 1Password item's notes field via an op:// reference or item title.", { reference: str("op:// reference or item title"), vault: str("optional vault") }), ["reference"]),
  req(def("remote_status", "Report where agent tools currently execute (your computer or the remote SSH computer) and the remote configuration."), []),
  req(def("contacts_list", "List contacts from the local address book (optionally filtered).", { query: str("optional name/tag filter") }), []),
  req(def("contacts_add", "Add or update a contact in the local address book.", { name: str("contact name"), emails: { type: "array", items: { type: "string" } }, phones: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } }, notes: str("optional notes") }), ["name"]),
  req(def("calendar_list", "List upcoming local calendar events (next N days).", { days: { type: "number" } }), []),
  req(def("calendar_add", "Create a local calendar event.", { title: str("event title"), start: str("start date-time (ISO or parseable)"), end: str("optional end"), location: str("optional location"), notes: str("optional notes") }), ["title", "start"]),
  req(def("skills_list", "List installed skills (replayable procedures).", {}), []),
  req(def("search_workspace", "Unified search across chats, memories, bots, automations, contacts, calendar and skills.", { query: str("search text") }), ["query"]),
];

const STATUS_BY_TOOL = {
  gh_repos: "Listing repositories",
  gh_read_file: "Reading a repository file",
  gh_write_file: "Committing to a repository",
  gh_issues: "Listing issues",
  gh_create_issue: "Creating an issue",
  gh_pulls: "Listing pull requests",
  gh_pr_comment: "Commenting on a pull request",
  gl_projects: "Listing GitLab projects",
  gl_read_file: "Reading a GitLab file",
  gl_issues: "Listing GitLab issues",
  gl_create_issue: "Creating a GitLab issue",
  bb_repos: "Listing Bitbucket repositories",
  bb_read_file: "Reading a Bitbucket file",
  az_projects: "Listing Azure DevOps projects",
  az_read_file: "Reading an Azure DevOps file",
  slack_channels: "Listing Slack channels",
  slack_send: "Sending a Slack message",
  slack_react: "Reacting in Slack",
  slack_history: "Reading Slack history",
  slack_search: "Searching Slack",
  teams_me: "Checking the Teams account",
  teams_chats: "Listing Teams chats",
  teams_send: "Sending a Teams message",
  teams_history: "Reading Teams history",
  imessage_send: "Sending an iMessage",
  imessage_recent: "Reading iMessages",
  email_send: "Sending an email",
  email_search: "Searching email",
  email_read: "Reading an email",
  op_items: "Listing 1Password items",
  op_read: "Reading a 1Password item",
  remote_status: "Checking execution target",
};

const INTEGRATION_TOOL_NAMES = new Set(TOOL_DEFS.map((d) => d.function.name));

/**
 * Execute an integration tool. ctx: { getInteg(name, field?), getRemote() }.
 * Returns null when `name` is not an integration tool (caller falls through
 * to the local tool dispatcher).
 */
async function executeIntegrationTool(call, ctx) {
  const { name, args } = call;
  if (!INTEGRATION_TOOL_NAMES.has(name)) return null;
  const g = ctx.getInteg;
  try {
    switch (name) {
      case "gh_repos": return { ok: true, repos: await repos.ghRepos(g("github", "apiToken")) };
      case "gh_read_file": return await repos.ghReadFile(g("github", "apiToken"), args.repo, args.path, args.ref);
      case "gh_write_file": return await repos.ghWriteFile(g("github", "apiToken"), args.repo, args.path, String(args.content ?? ""), args.branch, args.message);
      case "gh_issues": return { ok: true, issues: await repos.ghIssues(g("github", "apiToken"), args.repo, args.state) };
      case "gh_create_issue": return await repos.ghCreateIssue(g("github", "apiToken"), args.repo, args.title, args.body);
      case "gh_pulls": return { ok: true, pulls: await repos.ghPulls(g("github", "apiToken"), args.repo) };
      case "gh_pr_comment": return await repos.ghPrComment(g("github", "apiToken"), args.repo, args.number, args.body);
      case "gl_projects": return { ok: true, projects: await repos.glProjects(g("gitlab", "apiToken")) };
      case "gl_read_file": return await repos.glReadFile(g("gitlab", "apiToken"), args.project, args.path, args.ref);
      case "gl_issues": return { ok: true, issues: await repos.glIssues(g("gitlab", "apiToken"), args.project) };
      case "gl_create_issue": return await repos.glCreateIssue(g("gitlab", "apiToken"), args.project, args.title, args.body);
      case "bb_repos": return { ok: true, repos: await repos.bbRepos(g("bitbucket", "apiToken")) };
      case "bb_read_file": return await repos.bbReadFile(g("bitbucket", "apiToken"), args.repo, args.path, args.ref);
      case "az_projects": return { ok: true, projects: await repos.azProjects(g("azure", "apiToken"), g("azure", "org")) };
      case "az_read_file": return await repos.azReadFile(g("azure", "apiToken"), g("azure", "org"), args.project, args.repo, args.path, args.ref);
      case "slack_channels": return { ok: true, channels: await slackApi.listChannels(g("slack", "botToken")) };
      case "slack_send": return await slackApi.sendMessage(g("slack", "botToken"), args.channel, args.text);
      case "slack_react": return await slackApi.addReaction(g("slack", "botToken"), args.channel, args.timestamp, args.emoji);
      case "slack_history": return { ok: true, messages: await slackApi.history(g("slack", "botToken"), args.channel, args.limit) };
      case "slack_search": return { ok: true, results: await slackApi.searchMessages(g("slack", "botToken"), args.query) };
      case "teams_me": return await teamsApi.me(g("teams", "accessToken"));
      case "teams_chats": return { ok: true, chats: await teamsApi.listChats(g("teams", "accessToken")) };
      case "teams_send": return await teamsApi.sendChatMessage(g("teams", "accessToken"), args.chatId, args.text);
      case "teams_history": return { ok: true, messages: await teamsApi.chatHistory(g("teams", "accessToken"), args.chatId) };
      case "imessage_send": return await imessageApi.send(args.to, args.text);
      case "imessage_recent": return await imessageApi.recent(args.chatGuid, args.limit);
      case "email_send": return await emailApi.send(g("email", null) || {}, args);
      case "email_search": return await emailApi.search(g("email", null) || {}, args);
      case "email_read": return await emailApi.read(g("email", null) || {}, args);
      case "op_items": return await opvault.listItems(args.vault);
      case "op_read": return await opvault.readItem(args.reference, args.vault);
      case "remote_status": {
        const r = ctx.getRemote();
        return {
          ok: true,
          executionTarget: r.enabled ? "On its computer (remote SSH)" : "On your computer (local)",
          remote: r.enabled ? { name: r.name, host: r.host, user: r.user, port: r.port } : null,
        };
      }
      case "contacts_list": return { ok: true, contacts: contacts.search(ctx.store, args.query) };
      case "contacts_add": return contacts.upsert(ctx.store, args);
      case "calendar_list": return { ok: true, events: calendar.upcoming(ctx.store, Number(args.days) || 14) };
      case "calendar_add": return calendar.upsert(ctx.store, args);
      case "skills_list": return { ok: true, skills: skillsStore.list(ctx.store).map((s) => ({ id: s.id, name: s.name, steps: (s.steps || []).length, tools: s.tools })) };
      case "search_workspace": {
        const q = String(args.query || "").toLowerCase().trim();
        if (!q) return { ok: false, error: "search_workspace needs a query" };
        const hit = (s) => String(s || "").toLowerCase().includes(q);
        const store = ctx.store;
        const out = { chats: [], memories: [], bots: [], automations: [], contacts: [], events: [], skills: [] };
        for (const c of store.load("conversations", [])) {
          if (hit(c.title) || c.messages.some((m) => hit(m.content))) out.chats.push({ id: c.id, title: c.title, snippet: (c.messages.find((m) => hit(m.content))?.content || c.title).slice(0, 140) });
          if (out.chats.length >= 8) break;
        }
        out.memories = store.load("memories", []).filter((m) => hit(m.text)).slice(0, 8).map((m) => ({ id: m.id, text: m.text }));
        out.bots = store.load("bots", []).filter((b) => hit(b.name) || hit(b.instructions) || hit(b.description)).slice(0, 8).map((b) => ({ id: b.id, name: b.name }));
        out.automations = store.load("automations", []).filter((a) => hit(a.name) || hit(a.prompt)).slice(0, 8).map((a) => ({ id: a.id, name: a.name }));
        out.contacts = contacts.search(store, q).slice(0, 8).map((c) => ({ id: c.id, name: c.name }));
        out.events = calendar.list(store).filter((e) => hit(e.title) || hit(e.notes)).slice(0, 8).map((e) => ({ id: e.id, title: e.title, start: e.start }));
        out.skills = skillsStore.list(store).filter((s) => hit(s.name) || hit(s.instructions)).slice(0, 8).map((s) => ({ id: s.id, name: s.name }));
        return { ok: true, results: out };
      }
      default:
        return null;
    }
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { ok: false, error: String(err?.message || err) };
  }
}

module.exports = { TOOL_DEFS, STATUS_BY_TOOL, INTEGRATION_TOOL_NAMES, executeIntegrationTool };
