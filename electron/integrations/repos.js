// Repository connectors — GitHub, GitLab, Bitbucket, Azure DevOps via their
// public REST APIs with user-created personal access tokens (free). The
// agent gets read/write/issues/PR tools against the configured provider.
async function ghFetch(token, path, init) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "Emberling",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${typeof json === "string" ? json.slice(0, 200) : (json && json.message) || "error"}`);
  return json;
}

async function gitlabFetch(token, path, init) {
  const res = await fetch(`https://gitlab.com/api/v4${path}`, {
    ...init,
    headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`GitLab ${res.status}: ${typeof json === "string" ? json.slice(0, 200) : (json && json.message) || "error"}`);
  return json;
}

async function bbFetch(token, path, init) {
  const res = await fetch(`https://api.bitbucket.org/2.0${path}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(token).toString("base64")}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`Bitbucket ${res.status}: ${typeof json === "string" ? json.slice(0, 200) : (json && json.message) || "error"}`);
  return json;
}

async function azureFetch(token, org, project, path, init) {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project || "_apis/projects")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`Azure DevOps ${res.status}: ${typeof json === "string" ? json.slice(0, 200) : (json && json.error?.message) || "error"}`);
  return json;
}

/* ---------------- GitHub ---------------- */
async function ghRepos(token) {
  const rows = await ghFetch(token, "/user/repos?per_page=100&sort=updated");
  return rows.map((r) => ({ full_name: r.full_name, private: r.private, url: r.html_url, language: r.language }));
}
async function ghReadFile(token, repo, path, ref) {
  const j = await ghFetch(token, `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
  if (j.encoding === "base64" && j.content) return { ok: true, content: Buffer.from(j.content, "base64").toString("utf8").slice(0, 40000), sha: j.sha, size: j.size };
  return { ok: true, content: "(file too large or binary — use git clone)", sha: j.sha, size: j.size };
}
async function ghWriteFile(token, repo, path, content, branch, message) {
  let sha;
  try {
    const existing = await ghFetch(token, `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}${branch ? `?ref=${encodeURIComponent(branch)}` : ""}`);
    sha = existing.sha;
  } catch {}
  const j = await ghFetch(token, `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({ message: message || `Emberling: update ${path}`, content: Buffer.from(content, "utf8").toString("base64"), branch: branch || undefined, sha }),
  });
  return { ok: true, commit: j.commit?.sha, url: j.content?.html_url };
}
async function ghIssues(token, repo, state = "open") {
  const rows = await ghFetch(token, `/repos/${repo}/issues?state=${state}&per_page=30`);
  return rows.filter((r) => !r.pull_request).map((r) => ({ number: r.number, title: r.title, state: r.state, url: r.html_url, author: r.user?.login }));
}
async function ghCreateIssue(token, repo, title, body) {
  const j = await ghFetch(token, `/repos/${repo}/issues`, { method: "POST", body: JSON.stringify({ title, body: body || "" }) });
  return { ok: true, number: j.number, url: j.html_url };
}
async function ghPulls(token, repo) {
  const rows = await ghFetch(token, `/repos/${repo}/pulls?per_page=30`);
  return rows.map((r) => ({ number: r.number, title: r.title, state: r.state, url: r.html_url, branch: r.head?.ref }));
}
async function ghPrComment(token, repo, number, body) {
  const j = await ghFetch(token, `/repos/${repo}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  return { ok: true, url: j.html_url };
}

/* ---------------- GitLab ---------------- */
async function glProjects(token) {
  const rows = await gitlabFetch(token, "/projects?membership=true&per_page=100&order_by=last_activity_at");
  return rows.map((r) => ({ full_name: r.path_with_namespace, private: !r.public, url: r.web_url }));
}
async function glReadFile(token, project, path, ref) {
  const j = await gitlabFetch(token, `/projects/${encodeURIComponent(project)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref || "main")}`);
  return { ok: true, content: String(j).slice(0, 40000) };
}
async function glIssues(token, project) {
  const rows = await gitlabFetch(token, `/projects/${encodeURIComponent(project)}/issues?per_page=30`);
  return rows.map((r) => ({ number: r.iid, title: r.title, state: r.state, url: r.web_url }));
}
async function glCreateIssue(token, project, title, body) {
  const j = await gitlabFetch(token, `/projects/${encodeURIComponent(project)}/issues`, { method: "POST", body: JSON.stringify({ title, description: body || "" }) });
  return { ok: true, number: j.iid, url: j.web_url };
}

/* ---------------- Bitbucket ---------------- */
async function bbRepos(token) {
  const rows = await bbFetch(token, "/user/repositories?per_page=100");
  return (rows.values || []).map((r) => ({ full_name: r.full_name, private: r.is_private, url: r.links?.html?.href }));
}
async function bbReadFile(token, repo, path, ref) {
  const j = await bbFetch(token, `/repositories/${repo}/src/${encodeURIComponent(ref || "main")}/${path}`);
  return { ok: true, content: String(j).slice(0, 40000) };
}

/* ---------------- Azure DevOps ---------------- */
async function azProjects(token, org) {
  const j = await azureFetch(token, org, "", "/_apis/projects?api-version=7.0");
  return (j.value || []).map((p) => ({ name: p.name, id: p.id, url: p.url }));
}
async function azReadFile(token, org, project, repo, path, ref) {
  const j = await azureFetch(token, org, project, `/_apis/git/repositories/${encodeURIComponent(repo)}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${encodeURIComponent(ref || "main")}&includeContent=true&api-version=7.0`);
  return { ok: true, content: String(j.content || "").slice(0, 40000) };
}

module.exports = { ghRepos, ghReadFile, ghWriteFile, ghIssues, ghCreateIssue, ghPulls, ghPrComment, glProjects, glReadFile, glIssues, glCreateIssue, bbRepos, bbReadFile, azProjects, azReadFile };
