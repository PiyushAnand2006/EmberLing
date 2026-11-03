// Appearance-mode engine — maps the Settings "theme" mode onto a resolved
// data-theme attribute on <html> (the dark palette is the CSS default; light
// is an override block in tokens.css) and notifies subscribers when the
// resolved value flips. Diagram renderers (mermaid) subscribe to re-render.

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "dark" | "light";

type Listener = (theme: ResolvedTheme) => void;

const listeners = new Set<Listener>();
const darkQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
let currentMode: ThemeMode = "dark";
let current: ResolvedTheme = "dark";

export function resolvedTheme(): ResolvedTheme {
  return current;
}

export function onThemeChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function commit(next: ResolvedTheme) {
  if (current === next) return;
  current = next;
  document.documentElement.dataset.theme = next;
  for (const cb of listeners) cb(next);
}

/** Apply the settings mode. In "system" mode the OS listener below keeps it live. */
export function setThemeMode(mode: ThemeMode) {
  currentMode = mode;
  current = mode === "system" ? (darkQuery?.matches ? "dark" : "light") : mode;
  document.documentElement.dataset.theme = current;
}

// system mode: keep following the OS — main keeps nativeTheme.themeSource in
// sync, which drives prefers-color-scheme inside every renderer
const mq = darkQuery;
if (mq) {
  mq.addEventListener("change", () => {
    if (currentMode === "system") commit(mq.matches ? "dark" : "light");
  });
}
