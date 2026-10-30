# Window capture fallback for Emberling's window_screenshot tool — Win32
# PrintWindow with PW_RENDERFULLCONTENT over an EnumWindows title search, so
# every top-level window is a candidate (a process can own several windows)
# and the largest match wins. Works when the window is partially covered and
# when the Windows Graphics Capture path flakes out. Args: <titleFragment> <outPng>
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$OutPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not ("Win32Cap" -as [type])) {
  Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32Cap {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
}

$matches2 = New-Object System.Collections.ArrayList
$cb = [Win32Cap+EnumProc]{
  param($h, $l)
  if ([Win32Cap]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 512
    [Win32Cap]::GetWindowText($h, $sb, 512) | Out-Null
    $t = $sb.ToString()
    if ($t -and $t -like "*$Title*") {
      $r = New-Object Win32Cap+RECT
      [Win32Cap]::GetWindowRect($h, [ref]$r) | Out-Null
      [void]$matches2.Add(@{ H = $h; Title = $t; W = ($r.Right - $r.Left); Ht = ($r.Bottom - $r.Top) })
    }
  }
  return $true
}
[Win32Cap]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null

$best = $matches2 | Sort-Object { $_.W * $_.Ht } -Descending | Select-Object -First 1
if (-not $best -or $best.W -le 0 -or $best.Ht -le 0) {
  Write-Output "__NOWINDOW__"
  exit 0
}

$bmp = New-Object System.Drawing.Bitmap($best.W, $best.Ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 2 = PW_RENDERFULLCONTENT — include DWM-composited content (Chromium apps)
$ok = [Win32Cap]::PrintWindow($best.H, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()
if (-not $ok) {
  $bmp.Dispose()
  Write-Output "__NOWINDOW__"
  exit 0
}
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "__OK__ $($best.W)x$($best.Ht) $($best.Title)"
