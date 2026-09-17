[CmdletBinding()]
param(
  [ValidateSet("health", "manifest", "jobs", "get", "post-json")]
  [string]$Action = "health",
  [string]$BaseUrl = $(if ($env:URAGE_API_BASE_URL) { $env:URAGE_API_BASE_URL } else { "http://127.0.0.1:4782" }),
  [string]$AccessToken = $env:URAGE_API_TOKEN,
  [string]$Path = "",
  [string]$Json = "",
  [string]$DashboardRequestId = "",
  [string]$JobId = "",
  [ValidateSet("", "image", "model3d", "audio", "music", "video")]
  [string]$Kind = "",
  [ValidateRange(1, 250)]
  [int]$Limit = 50,
  [ValidateRange(1, 1800)]
  [int]$TimeoutSec = 1200
)

$base = $BaseUrl.Trim().TrimEnd("/")
if (-not $base) { throw "BaseUrl is required." }
$headers = @{}
if ($AccessToken.Trim()) { $headers["x-dashboard-access-token"] = $AccessToken.Trim() }

switch ($Action) {
  "health" { $target = "$base/health"; $method = "GET" }
  "manifest" { $target = "$base/api/llm-tools"; $method = "GET" }
  "jobs" {
    $queryParts = @("limit=$Limit")
    if ($DashboardRequestId.Trim()) { $queryParts += "requestId=$([Uri]::EscapeDataString($DashboardRequestId.Trim()))" }
    if ($JobId.Trim()) { $queryParts += "jobId=$([Uri]::EscapeDataString($JobId.Trim()))" }
    if ($Kind) { $queryParts += "kind=$([Uri]::EscapeDataString($Kind))" }
    $target = "$base/api/generation-jobs?$($queryParts -join '&')"
    $method = "GET"
  }
  "get" {
    if (-not $Path.Trim().StartsWith("/api/")) { throw "-Path must begin with /api/." }
    $target = "$base$($Path.Trim())"; $method = "GET"
  }
  "post-json" {
    if (-not $Path.Trim().StartsWith("/api/")) { throw "-Path must begin with /api/." }
    if (-not $Json.Trim()) { throw "-Json is required for post-json." }
    $null = $Json | ConvertFrom-Json
    $target = "$base$($Path.Trim())"; $method = "POST"
  }
}

try {
  $parameters = @{ Uri = $target; Method = $method; Headers = $headers; TimeoutSec = $TimeoutSec; ErrorAction = "Stop" }
  if ($Action -eq "post-json") { $parameters["ContentType"] = "application/json"; $parameters["Body"] = $Json }
  Invoke-RestMethod @parameters | ConvertTo-Json -Depth 20
} catch {
  $detail = $_.ErrorDetails.Message
  if ($detail) { throw "URageNow API request failed: $detail" }
  throw
}