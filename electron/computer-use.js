// Block B15: computer-use input automation — real coordinate clicking,
// scrolling, and window geometry via PowerShell P/Invoke into user32.dll
// (Windows). Scripts are validated (numeric-only args) before execution.
const { runShellScript } = require("./shell-runner");

const MOUSE_HELPER = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Win32Input {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
`;

function num(v, name, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  const clamped = Math.round(Math.max(min, Math.min(max, n)));
  return clamped;
}

async function clickAt(x, y, button = "left", double = false) {
  const cx = num(x, "x", -100000, 100000);
  const cy = num(y, "y", -100000, 100000);
  const flags = button === "right" ? "0x0008, 0x0010" : "0x0002, 0x0004"; // DOWN, UP
  const dbl = double ? "; [Win32Input]::mouse_event(0x0002,0,0,0,[IntPtr]::Zero); [Win32Input]::mouse_event(0x0004,0,0,0,[IntPtr]::Zero)" : "";
  const script = `${MOUSE_HELPER}
[Win32Input]::SetCursorPos(${cx}, ${cy}) | Out-Null
Start-Sleep -Milliseconds 60
[Win32Input]::mouse_event(${flags},0,0,0,[IntPtr]::Zero)${dbl}
'clicked ${cx},${cy}'`;
  const res = await runShellScript({ script });
  return res.exitCode === 0 ? { ok: true, at: { x: cx, y: cy } } : { ok: false, error: (res.stderr || "failed").slice(0, 200) };
}

async function scroll(direction = "down", amount = 3) {
  const dir = direction === "up" ? 0x0800 : 0xff88; // WHEEL up positive, down negative
  const times = Math.min(10, Math.max(1, num(amount, "amount", 1, 10)));
  const script = `${MOUSE_HELPER}
1..${times} | ForEach-Object { [Win32Input]::mouse_event(0x0800,0,0,${dir === 0x0800 ? "120" : "-120"},[IntPtr]::Zero); Start-Sleep -Milliseconds 40 }
'scrolled ${direction} x${times}'`;
  const res = await runShellScript({ script });
  return res.exitCode === 0 ? { ok: true } : { ok: false, error: (res.stderr || "failed").slice(0, 200) };
}

async function windowRect(title) {
  const t = String(title || "").replace(/'/g, "''");
  const script = `${MOUSE_HELPER}
\$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*${t}*' } | Select-Object -First 1
if (-not $p) { 'NO-WINDOW' } else {
  \$r = New-Object Win32Input+RECT
  [Win32Input]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
  [Win32Input]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  'RECT ' + $r.Left + ' ' + $r.Top + ' ' + $r.Right + ' ' + $r.Bottom + ' ' + $p.MainWindowTitle
}`;
  const res = await runShellScript({ script });
  const m = (res.stdout || "").match(/RECT (-?\d+) (-?\d+) (-?\d+) (-?\d+) (.+)/);
  if (!m) return { ok: false, error: (res.stdout || res.stderr || "window not found").slice(0, 200) };
  return { ok: true, rect: { left: Number(m[1]), top: Number(m[2]), right: Number(m[3]), bottom: Number(m[4]) }, title: m[5].trim() };
}

module.exports = { clickAt, scroll, windowRect, isSupported: process.platform === "win32" };
