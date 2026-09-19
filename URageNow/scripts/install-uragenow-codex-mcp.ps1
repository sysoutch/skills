[CmdletBinding()]
param(
  [string]$CodexConfigPath = (Join-Path $env:USERPROFILE ".codex\config.toml"),
  [string]$ApiBaseUrl = "http://127.0.0.1:4782",
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

$configDirectory = Split-Path -Parent $CodexConfigPath
[IO.Directory]::CreateDirectory($configDirectory) | Out-Null
$existing = if (Test-Path -LiteralPath $CodexConfigPath -PathType Leaf) {
  Get-Content -LiteralPath $CodexConfigPath -Raw
} else {
  ""
}

# Replace only this named MCP section; all other Codex configuration remains untouched.
$withoutURageNow = [regex]::Replace(
  $existing,
  '(?ms)^\[mcp_servers\.uragenow\]\s*\r?\n.*?(?=^\[|\z)',
  ''
).TrimEnd()
$entry = @"
[mcp_servers.uragenow]
command = "uragenow-mcp"
args = []
startup_timeout_sec = 15
tool_timeout_sec = 1200
env = { URAGE_API_BASE_URL = "$ApiBaseUrl" }
"@.Trim()
$updated = if ($withoutURageNow) { "$withoutURageNow`r`n`r`n$entry`r`n" } else { "$entry`r`n" }

if (Test-Path -LiteralPath $CodexConfigPath -PathType Leaf) {
  [IO.File]::Copy($CodexConfigPath, "$CodexConfigPath.uragenow-mcp-backup", $true)
}
[IO.File]::WriteAllText($CodexConfigPath, $updated, [Text.UTF8Encoding]::new($false))

[pscustomobject]@{
  command = "uragenow-mcp"
  npmBin = $npmBin
  codexConfig = $CodexConfigPath
  apiBaseUrl = $ApiBaseUrl
  restartRequired = $true
} | ConvertTo-Json