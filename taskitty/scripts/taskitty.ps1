# taskitty.ps1 - PowerShell client for the Taskitty local API.
# Windows-only and self-contained: no Node.js, no npm, no source checkout needed.
# Usage examples:
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 add <list_id> "Task name"
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 done <task_id>
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 board [board_id]
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 boards
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 token
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 start-api     (alias: start)
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 stop-api      (alias: stop)
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 status | health | which
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 task <task_id>
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 list-tasks <list_id>
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 start-date|due-date <task_id> "<ISO-8601 datetime>" | clear
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 comment <task_id> "text" (or @file)
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 reflections <task_id> [-Cause "text"] [-Solution "text"] [-Troubles "text"] [-Findings "text"] [-Todos "text"] [-Other "text"] [-BlogPost] [-FollowUp]
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 attach <task_id> <image-file>
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 comment-attach <comment_id> <image-file>
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 export-markdown <board_id> [-Scope board|list|task] [-ListId N|-TaskId N] [-Out file.md]
#       (filters like the GUI: -Tags id,id -Members id,id -Milestones id,id -Versions v1,v2 -Due any|overdue|today -HideHidden)
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 tags ["<board_id>"] | create-tag ["<board_id>"] "name" [#rrggbb]
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 tag-task <task_id> <tag_id> | untag-task <task_id> <tag_id>
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 members | create-member "name" [description]
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 member-task <task_id> <member_id> | unassign-member <task_id> <member_id>
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 board-member <board_id> <member_id> | unassign-board-member <board_id> <member_id>
#   .\.agents\skills\taskitty\scripts\taskitty.ps1 project-config [directory] -Replace -BoardId N -BoardName "name" -AuthorId N -AuthorName "name"
# Workspace : -Workspace <path> on any task action targets that registered DB; the default is ./taskitty.json's "databasePath" in the cwd when present, else Taskitty's active workspace.
# Board id  : 'board' without an explicit board_id defaults to ./taskitty.json's "boardId" - but only when that config file selected the workspace (no -Workspace override), since board ids are per-workspace.
# Author    : add/comment attribute tasks/comments to ./taskitty.json's "authorId" under the same rule, since member ids are per-workspace.
#
# Server executable resolution applies only to `start-api` (`which` / `configure`
# manage that start configuration). Every task command is an HTTP-only client of
# TASKITTY_API_URL / the saved endpoint / localhost; it never starts an EXE.
#
# Server executable resolution order (`which` prints exactly what was tried):
#   1. TASKITTY_API_EXE - exe path or its folder
#   2. saved path %APPDATA%\taskitty\api-server-path, written by `configure` and by the desktop app when it starts the API
#   3. Taskitty's installer registry entry (Uninstall DisplayName) -> InstallLocation / DisplayIcon folder - installed builds are found wherever they live
#   4. next to this script, then one folder up (portable layout: drop this CLI folder beside the executables)
# A source pointing at a missing file is skipped and the search continues, so a stale saved path falls through to the installer registry automatically.

param(
    [Parameter(Position = 0)]
    [string]$Action,
    [Parameter(Position = 1)]
    [string]$Arg1,
    [Parameter(Position = 2)]
    [string]$Arg2,
    [Parameter(Position = 3)]
    [string]$Arg3,
    # Named-only: targets a specific registered workspace database for task actions.
    [string]$Workspace = "",
    # Named-only (project-config): opt into replacing an existing taskitty.json in the target folder.
    [switch]$Replace = $false,
    # Named-only (project-config): default documentation board recorded in the generated config.
    [int]$BoardId = 0,
    [string]$BoardName = "",
    # Named-only (project-config): default author recorded in the generated config.
    [int]$AuthorId = 0,
    [string]$AuthorName = "",
    # Named-only (export-markdown): export scope and target ids.
    [ValidateSet("board", "list", "task")]
    [string]$Scope = "board",
    [int]$ListId = 0,
    [int]$TaskId = 0,
    # Named-only (export-markdown): destination file; empty prints to stdout.
    [string]$Out = "",
    # Named-only (export-markdown): card filters, same semantics as the GUI filter panel.
    [string]$Tags = "",
    [string]$Members = "",
    [string]$Milestones = "",
    [string]$Versions = "",
    [ValidateSet("any", "overdue", "today")]
    [string]$Due = "any",
    [switch]$HideHidden = $false,
    # Named-only (reflections): structured finishing comment sections; empty = section skipped.
    [string]$Cause = "",
    [string]$Solution = "",
    [string]$Troubles = "",
    [string]$Findings = "",
    [string]$Todos = "",
    [string]$Other = "",
    # Named-only (reflections): side effects mirroring the desktop Reflections panel.
    [switch]$BlogPost = $false,
    [switch]$FollowUp = $false
)

$ErrorActionPreference = "Stop"
if ($env:OS -ne 'Windows_NT') {
    Write-Error "taskitty.ps1 is the Windows client; on Linux/macOS use .agents/skills/taskitty/scripts/taskitty.sh (Node 18+)."
    exit 1
}
$DATA_DIR = Join-Path $env:APPDATA "taskitty"
$TOKEN_FILE = Join-Path $DATA_DIR "api-token"
$API_EXE_FILE = Join-Path $DATA_DIR "api-server-path"
$API_URL_FILE = Join-Path $DATA_DIR "api-server-url"
$PID_FILE = Join-Path $DATA_DIR "api.pid"
$LOG_FILE = Join-Path $DATA_DIR "api-server.log"
$API_EXE_NAME = "taskitty-api.exe"

function Resolve-ApiUrl {
    param([string]$Candidate)
    if (-not $Candidate -and (Test-Path $API_URL_FILE)) { $Candidate = (Get-Content $API_URL_FILE -Raw).Trim() }
    if (-not $Candidate) {
        $defaultPort = $env:TASKITTY_API_PORT
        if (-not $defaultPort) { $defaultPort = '38473' }
        $Candidate = "http://127.0.0.1:$defaultPort"
    }
    if ($Candidate -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://') { $Candidate = "http://$Candidate" }
    try {
        $uri = [System.Uri]$Candidate
        if ($uri.Scheme -notin @('http', 'https') -or -not $uri.Host -or $uri.UserInfo) { throw "invalid scheme or host" }
        return $uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/')
    } catch {
        Write-Error "Invalid Taskitty API endpoint: $Candidate"
        exit 1
    }
}

$BASE_URL = Resolve-ApiUrl $env:TASKITTY_API_URL
$API_URI = [System.Uri]$BASE_URL
$API_HOST = $API_URI.Host
$API_PORT = if ($API_URI.IsDefaultPort) { if ($API_URI.Scheme -eq 'https') { 443 } else { 80 } } else { $API_URI.Port }

function Test-PortOpen {
    $probe = $null
    try {
        $probe = New-Object System.Net.Sockets.TcpClient
        $probe.Connect($API_HOST, $API_PORT)
        return $true
    } catch {
        return $false
    } finally {
        if ($probe) { $probe.Dispose() }
    }
}

# Taskitty's installer registers a standard Uninstall entry; its InstallLocation
# (or the DisplayIcon folder) is where taskitty.exe and the API sidecar live.
function Get-RegistryInstallDirs {
    $result = New-Object System.Collections.Generic.List[string]
    foreach ($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryHive]::LocalMachine)) {
        $subpaths = @("SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
        if ($hive -eq [Microsoft.Win32.RegistryHive]::LocalMachine) {
            $subpaths += "SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        }
        foreach ($sub in $subpaths) {
            $root = $null
            try {
                $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, [Microsoft.Win32.RegistryView]::Default)
                $uninstall = $null
                try { $uninstall = $root.OpenSubKey($sub) } catch {}
                if (-not $uninstall) { continue }
                foreach ($name in @($uninstall.GetSubKeyNames())) {
                    $child = $null
                    try {
                        $child = $uninstall.OpenSubKey($name)
                        $displayName = [string]$child.GetValue("DisplayName")
                        if (-not ($displayName -match "Taskitty")) { continue }
                        $dir = ([string]$child.GetValue("InstallLocation")).Trim()
                        if (-not $dir) {
                            $icon = ([string]$child.GetValue("DisplayIcon")).Trim()
                            if ($icon) { $dir = Split-Path $icon -Parent }
                        }
                        if ($dir) {
                            $dir = $dir.TrimEnd('\')
                            if (-not $result.Contains($dir)) { $result.Add($dir) }
                        }
                    } catch {} finally {
                        if ($child) { $child.Dispose() }
                    }
                }
            } catch {} finally {
                if ($root) { $root.Dispose() }
            }
        }
    }
    return $result.ToArray()
}

# Ordered sources for the API executable; Get-ApiExe returns the first one that
# still points at an existing file.
function Get-ApiExeSource {
    $sources = New-Object System.Collections.Generic.List[object]
    $sources.Add(@{ Label = "TASKITTY_API_EXE"; Value = [string]$env:TASKITTY_API_EXE; FolderOnly = $false })
    $saved = ""
    if (Test-Path $API_EXE_FILE) { $saved = (Get-Content $API_EXE_FILE -Raw).Trim() }
    $sources.Add(@{ Label = "saved path ${API_EXE_FILE}"; Value = $saved; FolderOnly = $false })
    foreach ($dir in @(Get-RegistryInstallDirs)) {
        $sources.Add(@{ Label = "installer registry (${dir})"; Value = $dir; FolderOnly = $true })
    }
    $scriptDir = $PSScriptRoot
    if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
    $sources.Add(@{ Label = "beside this script (${scriptDir})"; Value = $scriptDir; FolderOnly = $true })
    $up = Split-Path -Parent $scriptDir
    if ($up) { $sources.Add(@{ Label = "one folder up (${up})"; Value = $up; FolderOnly = $true }) }
    return $sources.ToArray()
}

function Resolve-SourceCandidate {
    param($Source)
    $candidate = $null
    if ([bool]$Source.FolderOnly) {
        $candidate = Join-Path $Source.Value $API_EXE_NAME
    } elseif ($Source.Value) {
        try { $candidate = [System.IO.Path]::GetFullPath($Source.Value) } catch { return $null }
        if (Test-Path $candidate -PathType Container) { $candidate = Join-Path $candidate $API_EXE_NAME }
    }
    if ($candidate -and (Test-Path $candidate -PathType Leaf)) { return $candidate }
    return $null
}

function Get-ApiExe {
    # Returns @{ Path; SourceLabel }, or prints an actionable error and exits.
    foreach ($source in @(Get-ApiExeSource)) {
        $candidate = Resolve-SourceCandidate $source
        if ($candidate) {
            return @{ Path = (Resolve-Path $candidate).Path; SourceLabel = $source.Label }
        }
    }
    Write-Error "Could not locate ${API_EXE_NAME}. Install Taskitty, set TASKITTY_API_EXE, or run 'taskitty configure C:\Path\$API_EXE_NAME' once. Run 'taskitty which' to see what was tried."
    exit 1
}

function Invoke-ApiWhich {
    Write-Output "Looking for ${API_EXE_NAME}:"
    $resolved = $false
    foreach ($source in @(Get-ApiExeSource)) {
        if (-not $source.Value) {
            Write-Output "  [not set]   $($source.Label)"
            continue
        }
        $candidate = Resolve-SourceCandidate $source
        if ($candidate -and -not $resolved) {
            $resolved = $true
            Write-Output "  [resolved]  $($source.Label) -> $((Resolve-Path $candidate).Path)"
            break
        }
        Write-Output "  [missing]   $($source.Label): $($source.Value)"
    }
    if ($resolved) { Write-Output "Resolved (see above)." } else { Write-Output "Not found. Install Taskitty or run: taskitty configure C:\Path\$API_EXE_NAME" }
}

function Get-PidFromPortFile {
    try { return [int]((Get-Content $PID_FILE -Raw).Trim()) } catch { return $null }
}

function Get-PidListeningOnPort {
    # Fallback for servers started outside these helpers (e.g. by hand or the desktop app).
    try {
        foreach ($line in @(netstat -ano | Select-String ":38473 ")) {
            if ([string]$line -match "LISTENING") {
                $parts = ([string]$line).Trim() -split "\s+"
                return [int]$parts[-1]
            }
        }
    } catch {}
    return $null
}

function Invoke-ApiStart {
    # This is the only action allowed to launch taskitty-api. Task CRUD calls
    # the configured HTTP endpoint directly and never resolve an executable.
    if ($API_HOST -notin @('127.0.0.1', 'localhost', '::1')) {
        Write-Error "start-api only launches a local sidecar; $BASE_URL is remote. Start the API on that host, then use task commands normally."
        exit 1
    }
    if (Test-PortOpen) {
        Write-Output "Taskitty API is already running at $BASE_URL"
        return
    }
    $found = Get-ApiExe
    New-Item -ItemType Directory -Force -Path $DATA_DIR | Out-Null
    Add-Content -Path $LOG_FILE -Value ""
    Add-Content -Path $LOG_FILE -Value "--- started at $((Get-Date).ToString('o')) ---"
    Write-Output "Starting Taskitty API: $($found.Path) [$($found.SourceLabel)]"
    $exeQuoted = '"' + $found.Path + '"'
    if ($API_PORT -ne 38473) { $exeQuoted += " --port $API_PORT" }
    $cmdArgs = '/c "' + $exeQuoted + ' >> "' + $LOG_FILE + '" 2>&1"'
    $proc = Start-Process -FilePath "$env:ComSpec" -ArgumentList $cmdArgs -WindowStyle Hidden -PassThru
    Set-Content -Path $PID_FILE -Value ([string]$proc.Id)

    $deadline = (Get-Date).AddMinutes(10)
    $lastAnnounce = Get-Date
    while (-not (Test-PortOpen)) {
        if ((Get-Date) -gt $deadline) { Write-Error "server did not come up within 10 minutes. Log: $LOG_FILE"; exit 1 }
        if (((Get-Date) - $lastAnnounce).TotalSeconds -ge 30) { Write-Output "still starting..."; $lastAnnounce = Get-Date }
        Start-Sleep -Milliseconds 2000
    }
    Write-Output "Taskitty API is running at $BASE_URL"
    Write-Output ("PID: {0}   log: {1}" -f $proc.Id, $LOG_FILE)
}

function Invoke-ApiStop {
    if ($API_HOST -notin @('127.0.0.1', 'localhost', '::1')) {
        Write-Error "stop-api only controls a local sidecar; $BASE_URL is remote. Stop it on its host."
        exit 1
    }
    if (-not (Test-PortOpen)) {
        Remove-Item $PID_FILE -ErrorAction SilentlyContinue
        Write-Output "Taskitty API is not running."
        return
    }
    $targetPid = Get-PidFromPortFile
    if (-not $targetPid) { $targetPid = Get-PidListeningOnPort }
    if (-not $targetPid) {
        Write-Error "API is listening on 38473 but no PID was found. Stop it manually."
        exit 1
    }
    taskkill /PID $targetPid /T /F 2>$null | Out-Null
    $waitUntil = (Get-Date).AddSeconds(15)
    while ((Test-PortOpen) -and ((Get-Date) -lt $waitUntil)) { Start-Sleep -Milliseconds 200 }
    if (Test-PortOpen) {
        taskkill /PID $targetPid /T /F 2>$null | Out-Null # escalate once
        $waitUntil = (Get-Date).AddSeconds(10)
        while ((Test-PortOpen) -and ((Get-Date) -lt $waitUntil)) { Start-Sleep -Milliseconds 200 }
    }
    if (Test-PortOpen) {
        Write-Error "could not stop the API on 127.0.0.1:38473. PID was ${targetPid}."
        exit 1
    }
    Remove-Item $PID_FILE -ErrorAction SilentlyContinue
    Write-Output "Taskitty API stopped."
}

function Invoke-ApiStatus {
    if (Test-PortOpen) {
        $savedPid = Get-PidFromPortFile
        if ($savedPid) { Write-Output "running at $BASE_URL (PID ${savedPid})" } else { Write-Output "running at $BASE_URL" }
        return
    }
    Write-Output "not running"
    exit 1
}

function Get-Token {
    if (-not (Test-Path $TOKEN_FILE)) {
        Write-Error "Token file not found at $TOKEN_FILE. Run 'taskitty token' first."
        exit 1
    }
    return (Get-Content $TOKEN_FILE -Raw).Trim()
}

function Resolve-Payload {
    # "@path" reads free text from disk so quotes/newlines survive shell layers,
    # matching taskitty-launcher.cjs.
    param([string]$Value)
    if ($Value.StartsWith('@')) {
        $file = Join-Path (Get-Location).Path ($Value.Substring(1))
        return ((Get-Content $file -Raw).TrimEnd("`r", "`n"))
    }
    return $Value
}

function Resolve-Workspace {
    # Precedence matches taskitty-launcher.cjs: the -Workspace parameter wins, then a
    # project-local ./taskitty.json ("databasePath") in the cwd; empty = API default.
    if ($Workspace) { return $Workspace }
    $file = Join-Path (Get-Location).Path "taskitty.json"
    if (Test-Path $file) {
        try {
            $doc = Get-Content $file -Raw | ConvertFrom-Json
            if ($doc.PSObject.Properties['databasePath'] -and [string]$doc.databasePath) { return [string]$doc.databasePath }
        } catch {}
    }
    return ""
}

function Invoke-Taskitty {
    param([string]$Method, [string]$Path, [object]$Body = $null)
    if (-not (Test-PortOpen)) {
        Write-Error "API not reachable at $BASE_URL. Start it on that endpoint before running task commands."
        exit 1
    }
    $headers = @{ Authorization = "Bearer $(Get-Token)" }
    if ($null -ne $Body) {
        # All endpoints take a JSON body (WorkspaceRequest base), so an empty @{} is sent too; the optional workspace field selects a registered database.
        $ws = Resolve-Workspace
        if ($ws) { $Body['workspace'] = $ws }
        $json = $Body | ConvertTo-Json -Depth 10
        return Invoke-RestMethod -Uri "$BASE_URL$Path" -Method $Method -Headers $headers -ContentType "application/json" -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing
    } else {
        return Invoke-RestMethod -Uri "$BASE_URL$Path" -Method $Method -Headers $headers -UseBasicParsing
    }
}

# PowerShell switch clauses accept a single label each; normalize aliases first.
if ($Action -eq "start") { $Action = "start-api" }
elseif ($Action -eq "stop") { $Action = "stop-api" }

# Resolves the board id for tags/create-tag: explicit argument, else ./taskitty.json's
# "boardId" (only when no -Workspace override selected the database), mirroring `board`.
function Resolve-TagBoardId {
    param([string]$Explicit)
    if ($Explicit) { return $Explicit }
    if (-not $Workspace) {
        $file = Join-Path (Get-Location).Path "taskitty.json"
        if (Test-Path $file) {
            try {
                $doc = Get-Content $file -Raw | ConvertFrom-Json
                if ($doc.PSObject.Properties['boardId'] -and [string]$doc.boardId) { return [string]$doc.boardId }
            } catch {}
        }
    }
    return ""
}

# The project config's default author (./taskitty.json "authorId"), used to attribute tasks and
# comments created by add/comment - only when that same config selected the workspace, since
# member ids are per-workspace. Returns 0 when unset or not applicable.
function Get-ConfigAuthorId {
    if ($Workspace) { return 0 }
    $file = Join-Path (Get-Location).Path "taskitty.json"
    if (-not (Test-Path $file)) { return 0 }
    try {
        $doc = Get-Content $file -Raw | ConvertFrom-Json
        if ($doc.PSObject.Properties['authorId'] -and [int]$doc.authorId -gt 0) { return [int]$doc.authorId }
    } catch {}
    return 0
}

# Shared body for start-date/due-date: set or clear one of the card's date fields.
# (PowerShell switch clauses cannot carry comma-separated labels, so both actions
# funnel through this helper.)
function Set-TaskDate {
    param([string]$Kind)
    $label = if ($Kind -eq 'start') { 'start-date' } else { 'due-date' }
    if (-not $Arg1 -or -not $Arg2) {
        Write-Error "Usage: taskitty $label <task_id> `"<ISO-8601 datetime>`" | clear"
        exit 1
    }
    $field = if ($Kind -eq 'start') { 'start_datetime' } else { 'due_datetime' }
    $value = if ($Arg2 -ieq 'clear') { '' } else { Resolve-Payload $Arg2 }
    $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ $field = $value }
    if ($value) { Write-Output "Set $Kind date for task $($result.id) to $value" } else { Write-Output "Cleared $Kind date for task $($result.id)" }
}

switch ($Action) {
    "configure" {
        if (-not $Arg1) {
            Write-Error "Usage: taskitty.ps1 configure <path-to-$API_EXE_NAME>"
            exit 1
        }
        $candidate = $Arg1
        if (Test-Path $candidate -PathType Container) { $candidate = Join-Path $candidate $API_EXE_NAME }
        if (-not (Test-Path $candidate -PathType Leaf)) {
            Write-Error "Not a file: $Arg1"
            exit 1
        }
        $dir = Split-Path $API_EXE_FILE -Parent
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        (Resolve-Path $candidate).Path | Set-Content -NoNewline $API_EXE_FILE
        Write-Output "Taskitty API executable configured: $((Resolve-Path $candidate).Path)"
    }

    "configure-url" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty.ps1 configure-url <http://hostname:port>'
            exit 1
        }
        $endpoint = Resolve-ApiUrl $Arg1
        $dir = Split-Path $API_URL_FILE -Parent
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $endpoint | Set-Content -NoNewline $API_URL_FILE
        Write-Output "Taskitty API endpoint configured: $endpoint"
    }

    "which" {
        Invoke-ApiWhich
    }

    "token" {
        if (Test-Path $TOKEN_FILE) {
            Write-Output (Get-Content $TOKEN_FILE -Raw).Trim()
        } else {
            Write-Error "Token file not found at $TOKEN_FILE. Start the API once or copy its token from Taskitty Settings."
            exit 1
        }
    }

    "start-api" {
        Invoke-ApiStart
    }

    "stop-api" {
        Invoke-ApiStop
    }

    "status" {
        Invoke-ApiStatus
    }

    "health" {
        try {
            $headers = @{ Authorization = "Bearer $(Get-Token)" }
            $result = Invoke-RestMethod -Uri "$BASE_URL/v1/health" -Headers $headers -UseBasicParsing
            Write-Output "Health OK: $($result.ok) service=$($result.service)"
        } catch {
            if ($_.Exception.Message -match "Bearer") {
                Write-Error "API requires auth. Token file not found at $TOKEN_FILE."
            } else {
                Write-Error "API not reachable at $BASE_URL. Start it with 'taskitty start-api'."
            }
            exit 1
        }
    }

    "boards" {
        $result = Invoke-Taskitty -Method Post -Path "/v1/boards" -Body @{}
        foreach ($b in $result) {
            Write-Output "$($b.id)  $($b.name)"
        }
    }

    "create-board" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty create-board "Board name" [description]'
            exit 1
        }
        $body = @{ name = Resolve-Payload $Arg1 }
        if ($Arg2) { $body['description'] = Resolve-Payload $Arg2 }
        $result = Invoke-Taskitty -Method Post -Path "/v1/boards/create" -Body $body
        Write-Output "Created board id=$($result.id)"
    }

    "create-list" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty create-list <board_id> "List name"'
            exit 1
        }
        $result = Invoke-Taskitty -Method Post -Path "/v1/lists" -Body @{ board_id = [int]$Arg1; name = Resolve-Payload $Arg2 }
        Write-Output "Created list id=$($result.id)"
    }

    "delete-list" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty delete-list <list_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Delete -Path "/v1/lists/$Arg1" -Body @{}
        Write-Output "Deleted list id=$($result.id)"
    }

    "delete-board" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty delete-board <board_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Delete -Path "/v1/boards/$Arg1" -Body @{}
        Write-Output "Deleted board id=$($result.id)"
    }

    "project-config" {
        # Writes taskitty.json into an existing project directory through the API. The workspace is
        # selected exactly like for other actions (-Workspace, then ./taskitty.json in the cwd, else
        # the API's active workspace); replacing an existing config needs -Replace so a stray call
        # never clobbers a project's declared database.
        $directory = if ($Arg1) { $Arg1 } else { (Get-Location).Path }
        $body = @{ directory = $directory }
        if ($Replace) { $body['replace'] = $true }
        if ($BoardId -gt 0) { $body['board_id'] = [int]$BoardId }
        if ($BoardName) { $body['board_name'] = $BoardName }
        $result = Invoke-Taskitty -Method Post -Path "/v1/project-config" -Body $body
        Write-Output "Project config saved: $($result.path)"
    }

    "board" {
        if (-not $Arg1) {
            # Mirrors the launcher's rule: only inherit boardId when this project-local config selected the workspace.
            if (-not $Workspace) {
                $file = Join-Path (Get-Location).Path "taskitty.json"
                if (Test-Path $file) {
                    try {
                        $doc = Get-Content $file -Raw | ConvertFrom-Json
                        if ($doc.PSObject.Properties['boardId'] -and [string]$doc.boardId) { $Arg1 = [string]$doc.boardId }
                    } catch {}
                }
            }
        }
        if (-not $Arg1) {
            $why = if ($Workspace) { "the -Workspace override does not inherit a board id (board ids are per-workspace)" } else { 'no "boardId" in ./taskitty.json to default to' }
            Write-Error "Usage: taskitty board <board_id> (no board_id given and $why)"
            exit 1
        }
        $result = Invoke-Taskitty -Method Post -Path "/v1/boards/$Arg1" -Body @{}
        Write-Output "Board: $($result.name) (id=$($result.id))"
        if ($result.lists) {
            foreach ($l in $result.lists) {
                Write-Output "  List: $($l.id)  $($l.name)"
            }
        }
    }

    "add" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty add <list_id> "Task name"'
            exit 1
        }
        $body = @{ list_id = [int]$Arg1; name = Resolve-Payload $Arg2 }
        $authorId = Get-ConfigAuthorId
        if ($authorId -gt 0) { $body['author_id'] = $authorId }
        $result = Invoke-Taskitty -Method Post -Path "/v1/tasks" -Body $body
        Write-Output "Created task id=$($result.id)"
    }

    "done" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty done <task_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ done = $true }
        Write-Output "Marked task $($result.id) as done"
    }

    "undone" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty undone <task_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ done = $false }
        Write-Output "Marked task $($result.id) as not done"
    }

    "doing" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty doing <task_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ doing = $true }
        Write-Output "Marked task $($result.id) as doing"
    }

    "on_hold" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty on_hold <task_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ on_hold = $true }
        Write-Output "Marked task $($result.id) as on hold"
    }

    "off_doing" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty off_doing <task_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ doing = $false }
        Write-Output "Marked task $($result.id) as not doing"
    }

    "off_on_hold" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty off_on_hold <task_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ on_hold = $false }
        Write-Output "Marked task $($result.id) as not on hold"
    }

    "rename" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty rename <task_id> "New name"'
            exit 1
        }
        $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ name = Resolve-Payload $Arg2 }
        Write-Output "Renamed task $($result.id) to '$Arg2'"
    }

    "delete" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty delete <task_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Delete -Path "/v1/tasks/$Arg1" -Body @{}
        Write-Output "Deleted task $($result.id)"
    }

    "export-markdown" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty.ps1 export-markdown <board_id> [-Scope board|list|task] [-ListId N] [-TaskId N] [-Out file.md] [-Tags id,id] [-Members id,id] [-Milestones id,id] [-Versions v1,v2] [-Due any|overdue|today] [-HideHidden]'
            exit 1
        }
        $body = @{ board_id = [int]$Arg1; scope = $Scope }
        if ($ListId -gt 0) { $body.list_id = $ListId }
        if ($TaskId -gt 0) { $body.task_id = $TaskId }
        # Same filter fields as the GUI panel: empty selection = section off.
        $filter = @{}
        if ($Tags) { $filter.tags = @($Tags -split ',' | ForEach-Object { [int]$_.Trim() }) }
        if ($Members) { $filter.members = @($Members -split ',' | ForEach-Object { [int]$_.Trim() }) }
        if ($Milestones) { $filter.milestones = @($Milestones -split ',' | ForEach-Object { [int]$_.Trim() }) }
        if ($Versions) { $filter.versions = @($Versions -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
        if ($Due -ne 'any') { $filter.due = $Due }
        if ($HideHidden) { $filter.hide_hidden = $true }
        if ($filter.Count -gt 0) { $body.filter = $filter }
        $result = Invoke-Taskitty -Method Post -Path "/v1/export/markdown" -Body $body
        $markdown = [string]$result.markdown
        if (-not $markdown) { Write-Error "export returned no markdown for board $Arg1"; exit 1 }
        if ($Out) {
            $target = Join-Path (Get-Location).Path $Out
            Set-Content -Path $target -Value $markdown -NoNewline -Encoding utf8
            Write-Output "Wrote $target ($($markdown.Length) chars, scope=$Scope)"
        } else {
            Write-Output $markdown
        }
    }

    "description" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty description <task_id> "Description markdown"'
            exit 1
        }
        $result = Invoke-Taskitty -Method Patch -Path "/v1/tasks/$Arg1" -Body @{ description = Resolve-Payload $Arg2 }
        Write-Output "Set description for task $($result.id)"
    }

    "start-date" { Set-TaskDate "start" }

    "due-date" { Set-TaskDate "due" }

    "list-tasks" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty list-tasks <list_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Post -Path "/v1/lists/$Arg1/tasks" -Body @{}
        $tasks = @($result.tasks)
        Write-Output "List $($result.id): $($result.name) ($($tasks.Count)/$($result.task_total) tasks)"
        foreach ($t in $tasks) {
            $flags = @()
            if ($t.done) { $flags += "done" }
            if ($t.doing) { $flags += "doing" }
            if ($t.on_hold) { $flags += "on hold" }
            $flagText = ""
            if ($flags.Count -gt 0) { $flagText = " - $($flags -join ', ')" }
            Write-Output "  Task $($t.id): $($t.name)$flagText"
            if ($t.start_datetime) { Write-Output "    start: $($t.start_datetime)" }
            if ($t.due_datetime) { Write-Output "    due:   $($t.due_datetime)" }
        }
    }

    "task" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty task <task_id>'
            exit 1
        }
        $result = Invoke-Taskitty -Method Post -Path "/v1/tasks/$Arg1" -Body @{}
        $t = $result.task
        $flags = @()
        if ($t.done) { $flags += "done" }
        if ($t.doing) { $flags += "doing" }
        if ($t.on_hold) { $flags += "on hold" }
        $flagText = ""
        if ($flags.Count -gt 0) { $flagText = " - $($flags -join ', ')" }
        Write-Output ('Task {0}: {1} (list "{2}", board {3}){4}' -f $result.id, $t.name, $result.list_name, $result.board_id, $flagText)
        if ($t.description) {
            $desc = ([string]$t.description).Trim() -replace "[\r\n]+", " "
            if ($desc.Length -gt 200) { $desc = $desc.Substring(0, 200) + "..." }
            Write-Output "  description: $desc"
        }
        if ($t.start_datetime) { Write-Output "  start: $($t.start_datetime)" }
        if ($t.due_datetime) { Write-Output "  due:   $($t.due_datetime)" }
        if ($t.tags) {
            $tagNames = @($t.tags | ForEach-Object { [string]$_.name }) -join ', '
            if ($tagNames) { Write-Output "  tags: $tagNames" }
        }
        if ($t.members) {
            $memberNames = @($t.members | ForEach-Object { [string]$_.name }) -join ', '
            if ($memberNames) { Write-Output "  members: $memberNames" }
        }
        if ($t.comments) {
            foreach ($c in @($t.comments)) {
                $msg = ([string]$c.message).Trim() -replace "[\r\n]+", " "
                if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) + "..." }
                $who = ""
                if ($c.author_name) { $who = " by $($c.author_name)" }
                Write-Output "  Comment $($c.id)$($who)[$($c.added_datetime)]"
                Write-Output "    $msg"
            }
        }
    }

    "comment" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty comment <task_id> "text" (supports @file)'
            exit 1
        }
        $body = @{ message = Resolve-Payload $Arg2 }
        $authorId = Get-ConfigAuthorId
        if ($authorId -gt 0) { $body['author_id'] = $authorId }
        $result = Invoke-Taskitty -Method Post -Path "/v1/tasks/$Arg1/comments" -Body $body
        Write-Output "Added comment id=$($result.id) on task $Arg1"
    }

    "edit_comment" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty edit_comment <comment_id> "new text" (supports @file)'
            exit 1
        }
        Invoke-Taskitty -Method Patch -Path "/v1/comments/$Arg1" -Body @{ message = Resolve-Payload $Arg2 } | Out-Null
        Write-Output "Edited comment $Arg1"
    }

    "reflections" {
        # Structured finishing comment - the desktop Reflections panel through the API. Filled
        # sections are composed in fixed order into "Title: text" lines on one card comment;
        # -BlogPost / -FollowUp mirror the panel's side effects (draft note, follow-up card).
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty reflections <task_id> [-Cause "text"] [-Solution "text"] [-Troubles "text"] [-Findings "text"] [-Todos "text"] [-Other "text"] [-BlogPost] [-FollowUp]'
            exit 1
        }
        $body = @{}
        if ($Cause) { $body['cause'] = Resolve-Payload $Cause }
        if ($Solution) { $body['solution'] = Resolve-Payload $Solution }
        if ($Troubles) { $body['troubles'] = Resolve-Payload $Troubles }
        if ($Findings) { $body['findings'] = Resolve-Payload $Findings }
        if ($Todos) { $body['todos'] = Resolve-Payload $Todos }
        if ($Other) { $body['other'] = Resolve-Payload $Other }
        if (-not $body.Keys) { Write-Error 'reflections: at least one section is required (use `comment` for a plain note)'; exit 1 }
        if ($BlogPost) { $body['create_blog_post'] = $true }
        if ($FollowUp) { $body['create_follow_up_task'] = $true }
        $authorId = Get-ConfigAuthorId
        if ($authorId -gt 0) { $body['author_id'] = $authorId }
        $result = Invoke-Taskitty -Method Post -Path "/v1/tasks/$Arg1/reflections" -Body $body
        $extra = ""
        if ($result.follow_up_task_id) { $extra += " (follow-up task $($result.follow_up_task_id))" }
        if ($result.blog_note_id) { $extra += " (blog draft note $($result.blog_note_id))" }
        Write-Output "Saved finishing comment id=$($result.comment_id) on task $Arg1$extra"
    }

    "delete_comment" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty delete_comment <comment_id>'
            exit 1
        }
        Invoke-Taskitty -Method Delete -Path "/v1/comments/$Arg1" -Body @{} | Out-Null
        Write-Output "Deleted comment $Arg1"
    }

    "attach" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty attach <task_id> <file>'
            exit 1
        }
        if (-not (Test-Path $Arg2 -PathType Leaf)) {
            Write-Error "Attachment file not found: $Arg2"
            exit 1
        }
        $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Arg2))
        $result = Invoke-Taskitty -Method Post -Path "/v1/tasks/$Arg1/attachments" -Body @{ name = (Split-Path $Arg2 -Leaf); data_base64 = [Convert]::ToBase64String($bytes) }
        Write-Output "Attached $(Split-Path $Arg2 -Leaf) as cover attachment id=$($result.attachment_id) on task $Arg1"
    }

    "comment-attach" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty comment-attach <comment_id> <file>'
            exit 1
        }
        if (-not (Test-Path $Arg2 -PathType Leaf)) {
            Write-Error "Attachment file not found: $Arg2"
            exit 1
        }
        $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Arg2))
        $result = Invoke-Taskitty -Method Post -Path "/v1/comments/$Arg1/attachments" -Body @{ name = (Split-Path $Arg2 -Leaf); data_base64 = [Convert]::ToBase64String($bytes) }
        Write-Output "Attached $(Split-Path $Arg2 -Leaf) as attachment id=$($result.attachment_id) on comment $Arg1"
    }

    "tags" {
        $boardId = Resolve-TagBoardId $Arg1
        if (-not $boardId) {
            Write-Error 'Usage: taskitty tags ["<board_id>"] (no board id given and no "boardId" in ./taskitty.json to default to)'
            exit 1
        }
        $result = Invoke-Taskitty -Method Post -Path "/v1/boards/$boardId/tags" -Body @{}
        foreach ($tag in @($result)) { Write-Output "$($tag.id)  $($tag.name)" }
    }

    "create-tag" {
        # Numeric first argument = board id; otherwise the name-first form.
        $explicit = ""; $offset = 0
        if ($Arg1 -and $Arg1 -match '^\d+$') { $explicit = $Arg1; $offset = 1 }
        $name = if ($offset -eq 0) { $Arg1 } else { $Arg2 }
        if (-not $name) { Write-Error 'Usage: taskitty create-tag ["<board_id>"] "name" [color]'; exit 1 }
        $boardId = Resolve-TagBoardId $explicit
        if (-not $boardId) {
            Write-Error 'Usage: taskitty create-tag ["<board_id>"] "name" [color] (no board id given and no "boardId" in ./taskitty.json to default to)'
            exit 1
        }
        $body = @{ board_id = [int]$boardId; name = Resolve-Payload $name }
        $color = if ($offset -eq 0) { $Arg2 } else { $Arg3 }
        if ($color) { $body['color'] = $color }
        $result = Invoke-Taskitty -Method Post -Path "/v1/tags" -Body $body
        Write-Output "Created tag id=$($result.id) on board $boardId"
    }

    "tag-task" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty tag-task <task_id> <tag_id>'
            exit 1
        }
        Invoke-Taskitty -Method Post -Path "/v1/tasks/$Arg1/tags" -Body @{ tag_id = [int]$Arg2 } | Out-Null
        Write-Output "Tagged task $Arg1 with tag $Arg2"
    }

    "untag-task" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty untag-task <task_id> <tag_id>'
            exit 1
        }
        Invoke-Taskitty -Method Delete -Path "/v1/tasks/$Arg1/tags/$Arg2" -Body @{} | Out-Null
        Write-Output "Removed tag $Arg2 from task $Arg1"
    }

    "members" {
        $result = Invoke-Taskitty -Method Post -Path "/v1/members" -Body @{}
        foreach ($m in @($result)) {
            $desc = if ($m.description) { " - $($m.description)" } else { "" }
            Write-Output "$($m.id)  $($m.name)$desc"
        }
    }

    "create-member" {
        if (-not $Arg1) {
            Write-Error 'Usage: taskitty create-member "name" [description]'
            exit 1
        }
        $body = @{ name = Resolve-Payload $Arg1 }
        if ($Arg2) { $body['description'] = Resolve-Payload $Arg2 }
        $result = Invoke-Taskitty -Method Post -Path "/v1/members/create" -Body $body
        Write-Output "Created member id=$($result.id)"
    }

    "member-task" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty member-task <task_id> <member_id>'
            exit 1
        }
        Invoke-Taskitty -Method Post -Path "/v1/tasks/$Arg1/members" -Body @{ member_id = [int]$Arg2 } | Out-Null
        Write-Output "Assigned member $Arg2 to task $Arg1"
    }

    "unassign-member" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty unassign-member <task_id> <member_id>'
            exit 1
        }
        Invoke-Taskitty -Method Delete -Path "/v1/tasks/$Arg1/members/$Arg2" -Body @{} | Out-Null
        Write-Output "Unassigned member $Arg2 from task $Arg1"
    }

    "board-member" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty board-member <board_id> <member_id>'
            exit 1
        }
        Invoke-Taskitty -Method Post -Path "/v1/boards/$Arg1/members" -Body @{ member_id = [int]$Arg2 } | Out-Null
        Write-Output "Assigned member $Arg2 to board $Arg1"
    }

    "unassign-board-member" {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error 'Usage: taskitty unassign-board-member <board_id> <member_id>'
            exit 1
        }
        Invoke-Taskitty -Method Delete -Path "/v1/boards/$Arg1/members/$Arg2" -Body @{} | Out-Null
        Write-Output "Unassigned member $Arg2 from board $Arg1"
    }

    default {
        Write-Error "Unknown action: $Action"
        Write-Output "Available actions: configure, configure-url, which, token, start-api (start), stop-api (stop), status, health, boards, create-board, create-list, delete-list, delete-board, project-config, board, add, done, undone, doing, on_hold, off_doing, off_on_hold, rename, description, start-date, due-date, list-tasks, task, comment, edit_comment, delete_comment, attach, comment-attach, tags, create-tag, tag-task, untag-task, members, create-member, member-task, unassign-member, board-member, unassign-board-member, delete, export-markdown"
        exit 1
    }
}
