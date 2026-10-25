// Simple JSON persistence in userData, mirroring the original's local stores
// (conversations, bots, memories, automations, settings).
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const caches = new Map();

function fileFor(name) {
  return path.join(app.getPath("userData"), `${name}.json`);
}

function load(name, fallback) {
  if (caches.has(name)) return caches.get(name);
  let data = fallback;
  try {
    data = JSON.parse(fs.readFileSync(fileFor(name), "utf8"));
  } catch {
    /* first run or corrupt: keep fallback */
  }
  caches.set(name, data);
  return data;
}

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    for (const [name, data] of caches) {
      try {
        const p = fileFor(name);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
      } catch (err) {
        console.error(`store: failed to persist ${name}`, err);
      }
    }
  }, 150);
}

function update(name, fn) {
  const next = fn(load(name));
  caches.set(name, next);
  scheduleFlush();
  return next;
}

function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const [name, data] of caches) {
    try {
      const p = fileFor(name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`store: failed to persist ${name}`, err);
    }
  }
}

module.exports = { load, update, flushNow, fileFor };
