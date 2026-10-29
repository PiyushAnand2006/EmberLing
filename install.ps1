<#
Emberling one-command installer / updater.

  Install (latest):  irm https://raw.githubusercontent.com/PiyushAnand2006/EmberLing/main/install.ps1 | iex
  Update in place:   iwr https://raw.githubusercontent.com/PiyushAnand2006/EmberLing/main/update.ps1 | iex
  With options:      & ([scriptblock]::Create((irm https://raw.githubusercontent.com/PiyushAnand2006/EmberLing/main/install.ps1))) -Version 0.75.13 -Portable

Downloads the versioned installer from this repo's GitHub Releases and runs
it. Re-running over an existing install upgrades in place — chats, bots,
memories, keys and Dotling VMs are preserved.
#>
param(
  [string]$Version = "latest",
  [switch]$Portable,
  # NSIS silent install (/S). Use -NoSilent to walk the installer wizard.
  [switch]$NoSilent,
  # resolve + download + validate, but do not launch the installer
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$Repo = "PiyushAnand2006/EmberLing"
$RepoUrl = "https://github.com/$Repo"
# only GitHub's release hosts are ever contacted
$AllowedHosts = @("api.github.com", "github.com", "objects.githubusercontent.com", "raw.githubusercontent.com")
$Headers = @{ "User-Agent" = "Emberling-Installer" }

function Assert-Url([string]$Url) {
  $u = [uri]$Url
  if ($u.Scheme -ne "https") { throw "refusing non-https download: $Url" }
  if ($AllowedHosts -notcontains $u.Host) { throw "refusing unexpected host: $($u.Host)" }
}

Write-Host ""
Write-Host "Emberling installer" -ForegroundColor White
Write-Host "===================" -ForegroundColor DarkGray

# ---- resolve the version (GitHub API first, releases-redirect fallback) ----
if ($Version -eq "latest" -or $Version -match "^v") {
  $tag = $null
  try {
    $apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
    Assert-Url $apiUrl
    $rel = Invoke-RestMethod -Uri $apiUrl -Headers $Headers
    $tag = $rel.tag_name
  } catch {
    # rate-limited or offline API: the releases/latest redirect carries the tag
    try {
      $rUrl = "$RepoUrl/releases/latest"
      Assert-Url $rUrl
      $r = Invoke-WebRequest -Uri $rUrl -Headers $Headers -MaximumRedirection 0 -ErrorAction SilentlyContinue
      if ($r.Headers.Location) { $tag = ([uri]$r.Headers.Location).Segments[-1] }
    } catch {}
  }
  if (-not $tag) { throw "could not resolve the latest release - open $RepoUrl/releases to check" }
  $Version = $tag.TrimStart("v")
}
Write-Host ("Version : v" + $Version) -ForegroundColor White

# ---- pick the asset ----
$assetName = if ($Portable) { "Emberling-Portable-$Version.exe" } else { "Emberling-Setup-$Version.exe" }
$downloadUrl = "$RepoUrl/releases/download/v$Version/$assetName"
Assert-Url $downloadUrl

# ---- download ----
$dest = if ($Portable) { Join-Path (Join-Path $env:USERPROFILE "Downloads") $assetName } else { Join-Path $env:TEMP $assetName }
Write-Host ("Download: " + $assetName) -ForegroundColor Gray
if (-not $DryRun) {
  $ProgressPreference = "SilentlyContinue"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $dest -Headers $Headers
  $size = (Get-Item $dest).Length
  if ($size -lt 1MB) { throw "download looks wrong ($size bytes) - remove $dest and retry" }
  Write-Host ("Saved  : " + $dest + " (" + [math]::Round($size / 1MB, 1) + " MB)") -ForegroundColor Gray
} else {
  Write-Host "(dry run - download skipped)" -ForegroundColor DarkGray
}

# ---- install / update ----
if ($Portable) {
  if (-not $DryRun) { Write-Host "Portable build saved to your Downloads folder - run it from anywhere." }
} else {
  if ($DryRun) {
    Write-Host "(dry run - installer not launched)"
  } elseif ($NoSilent) {
    Write-Host "Launching the installer - follow the wizard. Upgrades in place; your data is kept."
    Start-Process -FilePath $dest -ArgumentList ""
  } else {
    Write-Host "Installing silently (add -NoSilent to see the wizard)..."
    Start-Process -FilePath $dest -ArgumentList "/S" -Wait
    Write-Host "Installed. Launch Emberling from the Start menu. Your data is preserved."
  }
}
Write-Host ""
Write-Host "Done - v$Version" -ForegroundColor Green
