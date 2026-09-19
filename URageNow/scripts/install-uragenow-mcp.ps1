[CmdletBinding()]
param(
  [string]$ClineSettingsPath = (Join-Path $env:USERPROFILE ".cline\data\settings\cline_mcp_settings.json"),
  [switch]$SkipPackageInstall
)

$ErrorActionPreference = "Stop"
$skillRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not (Test-Path -LiteralPath (Join-Path $skillRoot "package.json") -PathType Leaf)) {
  throw "URageNow MCP package.json was not found beside this installer."
}
$npm = Get-Command npm.cmd -ErrorAction Stop
if (-not $SkipPackageInstall) {
  & $npm.Source install --global $skillRoot
  if ($LASTEXITCODE -ne 0) { throw "npm global installation failed with exit code $LASTEXITCODE." }
}
$npmBin = (& $npm.Source prefix --global).Trim()
if (-not $npmBin) { throw "npm did not report a global bin directory." }
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$entries = @($userPath -split ";" | Where-Object { $_ })
if ($entries -notcontains $npmBin) {
  [Environment]::SetEnvironmentVariable("Path", (($entries + $npmBin) -join ";"), "User")
}
$settingsDirectory = Split-Path -Parent $ClineSettingsPath
[IO.Directory]::CreateDirectory($settingsDirectory) | Out-Null
$settings = if (Test-Path -LiteralPath $ClineSettingsPath -PathType Leaf) {
  Get-Content -LiteralPath $ClineSettingsPath -Raw | ConvertFrom-Json
} else {
  [pscustomobject]@{ mcpServers = [pscustomobject]@{} }
}
if ($null -eq $settings.mcpServers) {
  $settings | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{})
}
$settings.mcpServers | Add-Member -NotePropertyName uragenow -NotePropertyValue ([pscustomobject]@{
  type = "stdio"
  command = "uragenow-mcp"
  args = @()
  env = [pscustomobject]@{ URAGE_API_BASE_URL = "http://127.0.0.1:4782" }
  disabled = $false
}) -Force
[IO.File]::WriteAllText($ClineSettingsPath, ($settings | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
[pscustomobject]@{
  command = "uragenow-mcp"
  npmBin = $npmBin
  clineSettings = $ClineSettingsPath
  restartRequired = $true
} | ConvertTo-Json
