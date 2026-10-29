<#
Emberling one-command updater.

  iwr https://raw.githubusercontent.com/PiyushAnand2006/EmberLing/main/update.ps1 | iex

Fetches the latest release and upgrades in place (silent). Chats, bots,
memories, keys and Dotling VMs are preserved. The installed app also
self-updates; this command forces it on demand.
#>
$ErrorActionPreference = "Stop"
Write-Host "Updating Emberling to the latest release..." -ForegroundColor White
$script = Invoke-RestMethod -Uri "https://raw.githubusercontent.com/PiyushAnand2006/EmberLing/main/install.ps1" -Headers @{ "User-Agent" = "Emberling-Installer" }
& ([scriptblock]::Create($script)) -Silent
Write-Host "Update complete." -ForegroundColor Green
