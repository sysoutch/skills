# Taskitty development and task management

Consolidated skill for driving Taskitty (task board + local automation API) from an agent or shell. It works with a final-build install — a folder with `taskitty.exe` / `taskitty-api` and the bundled CLI clients; on Windows, PowerShell alone is enough (no Node, npm, or Cargo required).

Use the section that matches what you're doing:

- Finding Taskitty's CLI on an installed machine → **Locating the Taskitty CLI**
- Session start rules and task creation/finishing conventions → **Session workflow**
- Starting, stopping, tokenizing, or using the local API → **Local API (`taskitty-api`)**
- Creating, updating, commenting on, or deleting tasks in Taskitty → **Task management via the Taskitty CLI**
- User asks to record completed work as a Taskitty task → **Recording completed work as a Taskitty task**
- Exporting board/list/task state as Markdown, or using exports as session context → **Markdown export and memory-bank**

## Locating the Taskitty CLI

The final build ships the CLI clients flat beside the executables: `taskitty.bat` + `taskitty.ps1` (Node-free on Windows), `taskitty-launcher.cjs` (anywhere with Node 18+). Find the folder that contains them, in order:

1. **Beside `taskitty.exe`** — wherever Taskitty was installed or copied; if you know where the app lives, its CLI is in the same folder.
2. `%APPDATA%\taskitty\taskitty-exe-path` — the desktop app records its own executable path at startup; take that file's parent directory (works even before any API use).
3. **Windows installer registry** — an `Uninstall` entry with DisplayName "Taskitty" → `InstallLocation` (NSIS installs land in `%LOCALAPPDATA%\Programs\Taskitty`).

Once you have the folder, every command below runs as:

```powershell
<folder>\taskitty.bat <action> [args]              # Windows without Node (primary end-user path)
node <folder>/taskitty-launcher.cjs <action> [args]   # anywhere with Node 18+
```

Both clients expose identical actions; the PowerShell client uses named parameters where noted (`-Workspace`, `-Replace`, `-BoardId`, `-BoardName`). The clients find `taskitty-api` automatically (env var → saved path → installer registry → beside the script); run `which` to see exactly what was tried.

## Session workflow

Rules that apply to every session:

- Add **one or more** Taskitty tasks for the user's prompt: if one prompt contains several distinct pieces of work (multiple features, steps, deliverables), decompose it and create **one task per piece** — never cram multiple deliverables into a single task. For each **new task**, rephrase it into a concise title, add a description with more background information, assign 1 or more tags (create a new tag if no suitable one exists) and the fitting member(s) (`members` to list them; `create-member` if none fits), mark the task as `doing` before you start working on it, then do your work. **If a task already exists on the board and the user asks you to start or resume working on it, first bring that existing task up to the same standard: review and update its title/description if needed, ensure it has suitable tags and fitting member(s), set both `start-date` and `due-date` if missing or outdated, and mark it as `doing` before starting work.** Keep tags, members, dates, and status current throughout the work and update them later when the task's scope changes.

- Set **both a start date and a due date** (`start-date` / `due-date`) on every new card at creation time, unless there is an explicit reason not to (e.g. a pure backlog/idea card with no planned work window — say so in its description). Use ISO-8601 UTC datetimes; pick dates that reflect the real plan rather than placeholders.
- Record **follow-up tasks** as well: when a prompt implies possible or likely follow-up work (next steps, deferred parts, things that depend on what you are doing now), create cards for those too and mention them alongside the main task(s) so the user sees the full scope. Put speculative ones in an ideas/backlog-style list if the board has one (ask which list otherwise), and note dependencies between related cards in their descriptions.
- While working, use **normal comments** (`comment`) for progress updates; when you finish, update each task by adding a **finishing comment** — see *Recording completed work as a Taskitty task* for what it must cover.
- Before starting work in a project that keeps a `memory-bank/`, read the exported board/list Markdown under `memory-bank/exports/<board-id>/` (one subfolder per board; refresh with `export-markdown --out ...` when stale) so you start from current board state instead of re-deriving it; keep hand-written memory-bank notes for context that cannot be derived from the board itself — see **Markdown export and memory-bank**.
- If the task is done but needs to be verified, add a tag like `needs-verification` or `needs-review` and mention it in the finishing comment.
- If the local API is not running, start it with `start` before recording work. Use `tags`, `create-tag`, `tag-task`, `untag-task`, `members`, `create-member`, `member-task`, and `unassign-member` through the CLI; do not skip tags or members because a command is missing—implement the scoped command first.

## Ground rules

- **Wrapper clients, never raw HTTP.** Every Taskitty API operation goes through the bundled CLI — `taskitty.bat`/`taskitty.ps1` (Windows without Node) or `taskitty-launcher.cjs` (Node 18+). Never embed raw `curl` / `Invoke-RestMethod` calls in prompts.
- **Token hygiene.** The bearer token lives at `%APPDATA%\taskitty\api-token`. Never print, log, or commit it; keep it out of task titles, descriptions, source control, and chat output.
- **Loopback only.** The API binds to `127.0.0.1:38473` — it is not exposed on the network.
- **Honest verification.** Do not claim visual or runtime verification from compile/test results alone; be explicit about what was actually verified and mention incomplete verification plainly.

## Local API (`taskitty-api`)

The Taskitty local API (`taskitty-api`) is a loopback-only service that runs with or without the desktop app. The CLI clients ship beside `taskitty.exe` (see **Locating the Taskitty CLI**). Only `start` resolves and launches an already-built sidecar via `TASKITTY_API_EXE`, saved `%APPDATA%\taskitty\api-server-path`, Taskitty's installer registry entry, or beside the script (run `which` to see exactly what was tried). Every other action is HTTP-only: it calls `TASKITTY_API_URL`, saved `%APPDATA%\taskitty\api-server-url`, or the default loopback endpoint and never launches an executable. All Taskitty API operations work from any project via the bundled clients (Windows: PowerShell alone; other platforms: Node 18+).

Installed desktop users manage the same server from the app's settings overlay (gear button, bottom of the left rail): live status, Start/Stop and token copy — no Node or Cargo needed on their machine. All surfaces share `%APPDATA%\taskitty\api.pid` + log, so a server started by any one is visible to the others.

### Lifecycle

```powershell
<folder>\taskitty.bat start        # start; idempotent, waits until the port is live
<folder>\taskitty.bat status       # running URL + PID, or "not running"
<folder>\taskitty.bat stop         # stop via the recorded PID
```

### From any project

Call the installed CLI by absolute path for **all** actions — lifecycle (`start|stop|status|token`) and tasks (`boards`, `board <id>`, `add <list_id> "Task name"`, …):

```powershell
<folder>\taskitty.bat start | stop | status | token          # Windows, no Node needed
node <folder>/taskitty-launcher.cjs boards | board <id>      # anywhere with Node 18+
node <folder>/taskitty-launcher.cjs add <list_id> "Task name"
node <folder>/taskitty-launcher.cjs project-config [directory] [--replace]   # write a taskitty.json into another project (default dir: cwd); this is what bootstraps the file later calls in that folder pick up automatically
# Run `help` on the launcher for the full CRUD list; free-text args accept @file.
```

start-date <task_id> "<ISO-8601 datetime>" | clear   # set/clear the card's start date (e.g. "2026-09-07T00:00:00.000Z")
due-date <task_id> "<ISO-8601 datetime>" | clear     # set/clear the card's due date
list-tasks <list_id>                      # list every task in a list (ids + names, with start/due dates when present)

### Token

- Read `%APPDATA%\taskitty\api-token` without printing it (see Ground rules).
- If it does not exist yet, start the local API once (it generates the token) or copy it from the desktop Settings surface. `token` only reads the saved token and never executes the API binary.

### Workspaces

The API defaults to Taskitty's persisted active workspace. Supply a `workspace` field only when it is already registered in the desktop workspace selector; arbitrary database paths are intentionally rejected.

**Project-local database:** a project can declare its task documentation database in `taskitty.json` at the project root (a path registered in Taskitty's workspace selector). When documenting work on a project with such a config, target that database — not whatever workspace happens to be active globally. The CLI clients do this automatically when run from the project root (they read `./taskitty.json`'s `databasePath`) and accept an explicit override on any task action: `--workspace <path>` (`add 12 "Task name" --workspace C:\other\project.sqlite`; `-Workspace <path>` on the PowerShell client). Raw API request bodies take the same optional `"workspace": "<registered path>"` field. Precedence: explicit flag → cwd `taskitty.json` → the API's persisted active workspace. Generated configs also record `"boardId"` and `"boardName"` for the selected default documentation board; when run from a project root that has such a config, the clients' `tags`, `create-tag` and `board` actions default to it when no id is passed — so no guessing from `boards` is needed. An explicit numeric id always wins (`tags 1`), and an explicit `--workspace`/`-Workspace` override never inherits another project's board, because ids are per-workspace. Generated configs can also record `"authorId"`/`"authorName"` for a default author; from such a project root the clients' `add` and `comment` actions attribute created tasks and comments to that member (an explicit override never inherits it either, because member ids are per-workspace).

**Generate project config in the desktop UI:** in **Workspaces**, select the workspace, navigate to the project folder with the existing **Add existing database** folder browser, pick the project's default documentation board and optionally a default author in the section's selectors, then use **Link this project → Create taskitty.json here** (the config records them as `boardId`/`boardName` / `authorId`/`authorName`). Native confirmation is required for creation and replacement. This deliberately is not offered in browser mode: only desktop has the constrained, registry-validated filesystem command.

**Generate project config from the CLI:** `<t> project-config [directory] [--replace] [--board-id N --board-name "name"] [--author-id N --author-name "name"]` (PowerShell client: `-Replace`/`-BoardId`/`-BoardName`/`-AuthorId`/`-AuthorName`) asks the API to write a registry-validated `taskitty.json` into an existing folder — default is the current directory. Without `--workspace`, it links to the API's active workspace; replacing an existing file requires `--replace`.

## Task management via the Taskitty CLI

Use these rules when creating, updating, or managing tasks in Taskitty. Prerequisites: the API must already be running (`start` for a local sidecar, or an endpoint configured with `configure-url` / `TASKITTY_API_URL`) and the token available (see **Local API**). Every operation goes through the bundled CLI — `<folder>\taskitty.bat` on Windows without Node, `node <folder>/taskitty-launcher.cjs` anywhere with Node 18+; it handles auth, URL construction, and JSON serialization automatically.

All Taskitty API operations should go through the CLI:

```powershell
# <t> = your Taskitty CLI entry point (see Locating the Taskitty CLI)
<t> add <list_id> "Task name"                        # create a task in a list
<t> done <task_id>                                   # mark done (auto-moves if workflow rule set)
<t> undone <task_id>                                 # unmark done (does NOT move the card back)
<t> doing <task_id>                                  # mark doing (auto-moves if workflow rule set)
<t> off_doing <task_id>                              # unmark doing
<t> on_hold <task_id>                                # mark on hold (auto-moves if workflow rule set)
<t> off_on_hold <task_id>                            # unmark on hold
<t> description <task_id> "<markdown description>"
<t> rename <task_id> "New name"
<t> delete <task_id>                                 # permanently delete a task
<t> comment <task_id> "<text>"                       # add a card comment (prints its id)
<t> reflections <task_id> [--cause|--solution|--troubles|--findings|--todos|--other "text"] [--blog] [--follow-up]   # structured finishing comment (Reflections sections; @file payloads work too)
<t> edit_comment <comment_id> "<new text>"           # edit a comment message
<t> delete_comment <comment_id>                      # delete a comment
<t> attach <task_id> <file>                          # upload file and set it as the card cover
<t> comment-attach <comment_id> <file>               # upload file onto an existing comment
<t> tags <board_id>                                  # list board tags
<t> create-tag <board_id> "name" [\#rrggbb]
<t> tag-task <task_id> <tag_id>                      # assign tag to task
<t> untag-task <task_id> <tag_id>                    # remove tag from task
<t> members                                          # list workspace members (id, name, description)
<t> create-member "name" [description]               # create a member, prints its id
<t> member-task <task_id> <member_id>                # assign member to task (no-op if already assigned)
<t> unassign-member <task_id> <member_id>            # remove member from task
<t> board-member <board_id> <member_id>              # assign member to a board (no-op if already assigned)
<t> unassign-board-member <board_id> <member_id>     # remove member from a board
<t> boards                                           # list all boards
<t> create-board "Project board" "Optional description"
<t> create-list <board_id> "Backlog"
<t> delete-list <list_id>                          # remove a list and (via FK cascade) its tasks
<t> project-config [directory] [--replace] [--board-id N --board-name "name"] [--author-id N --author-name "name"]  # write taskitty.json via the API (default directory: cwd)
<t> delete-board <board_id>
<t> board <board_id>                                 # show board details + lists
<t> task <task_id>                                   # show one task incl. its comment ids
<t> health                                           # check API is reachable
```

(PowerShell client equivalents use named parameters: `taskitty.ps1 project-config -Replace -BoardId 2 -BoardName "My Project"`, `-Workspace <path>` on any task action.)

Free-text arguments (`add`, `rename`, `description`, comments) accept `@<path>` to read the value from a file — use this on Windows when text contains quotes or newlines that npm/PowerShell would mangle.

**Workspace selection:** every task action accepts `--workspace <path>` (anywhere in the argument list, also after npm's `--`) to target one registered database; without it, a `taskitty.json` with `"databasePath"` in the current directory is used as the project default — which is why running from the project root needs no extra flags.

**Report names with ids.** Whenever you summarize or report anything read from Taskitty — a created/updated card, board state, where a card landed after `done` / auto-move — pair every id with its human-readable name as returned by the CLI (`boards`, `board <id>`, `task <id>`): e.g. "card 'Ship CLI client' (id=44) in list 'Done' (id=12) on board 'My Project' (id=3)". Never report bare ids like "list 12" or "card 44" without the name next to them.

### Workflow routing (auto-move) behavior

When a board has workflow rules configured (Board settings → "Workflow routing"), the **API respects them**, matching the desktop app:

- Marking a task **done** / **doing** / **on hold** moves it to the end of the configured target list when the rule is enabled.
- Turning a flag **off** (`undone`, `off_doing`, `off_on_hold`) never moves the card back — same as the desktop app.

Always refetch the board (`board <id>`) after marking done/doing/on-hold when placement matters, so you can see where the card actually landed — and report that landing spot with list/board names alongside ids (see **Report names with ids**).

### Creating a task

For a prompt that contains several pieces of work, create one card per piece (see **Session workflow**) and repeat steps 4–6 for each; record implied follow-up work as its own card(s) too.

1. Run `boards` to see available boards.
2. Run `board <id>` to list the lists within a board.
3. Ask the user which list to use if no obvious choice exists.
4. Create the task with `add <list_id> "<name>"`.
5. Add a description with `description <task_id> "<markdown>"`.
6. Assign tags and members: list existing ones with `tags` / `members`, create what is missing (`create-tag` / `create-member`), then link them with `tag-task` / `member-task`. Every task should carry at least one tag and a fitting member from the moment it exists; adjust both later when the scope changes.

### Updating a task

**Picking up an existing card:** before starting work on a card that already exists, check whether it carries tags, comments and dates — if any are missing, update them first so the card reflects the work being done: assign at least one fitting tag (and member) with `tag-task` / `member-task`, set both dates with `start-date` / `due-date`, and add a comment recording that work has started.

7. Set both dates: `start-date <task_id> "<ISO-8601 datetime>"` and `due-date <task_id> "<ISO-8601 datetime>"`. Every card should carry a start date and a due date from the moment it exists, unless there is an explicit reason not to (see **Session workflow**).

All update actions are covered by the command list above (done/doing/on-hold flags, rename, description, tags via `tag-task` / `untag-task`, members via `member-task` / `unassign-member`, dates via `start-date` / `due-date`, delete). Keep a card's tags, members and dates current as its scope changes. For comments: add one with `comment`; edit or delete it with `edit_comment` / `delete_comment`, getting comment ids from `task <task_id>` or the board graph.

## Markdown export and memory-bank

Exported Markdown is a self-describing snapshot of board state: the header carries an export timestamp plus the active-filter summary, lists keep their board order, cards carry state/dates/tags/members/versions, and task-level exports add description, checklists and comments. Exports are rendered **natively from the full database graph** (not the lazy-loaded GUI view), so they always contain every card — including ones the UI has not loaded yet.

### Exporting

```powershell
# <t> = your Taskitty CLI entry point (see Locating the Taskitty CLI)
<t> export-markdown ["<board_id>"] [--scope board|list|task] [--list-id N] [--task-id N] [--out file.md]
# PowerShell client: -Scope/-ListId/-TaskId/-Out; filters: -Tags id,id -Members id,id -Milestones id,id -Versions v1,v2 -Due any|overdue|today -HideHidden
```

- `--scope board` (default) renders the whole board; `list` needs `--list-id`; `task` needs `--task-id`. Without `--out`, Markdown goes to stdout.
- Filter flags apply the **same semantics as the GUI filter panel** (empty selection = section off): tags/members/milestones keep cards carrying any of the given ids, versions match card version labels, `--due overdue|today` filters by due date, and `--hide-hidden` skips hidden lists/cards. The desktop app exposes the same export from its board Export popover ("Export markdown"), list context menu, and card context menu — all surfaces share one native renderer, so results are identical.
- Omitted board ids default to `./taskitty.json`'s "boardId" like every other action (see **Local API → Workspaces**).

### Memory-bank convention

Projects that keep a `memory-bank/` store exported snapshots under `memory-bank/exports/<board-id>/`, one subfolder per board (e.g. `exports/board-3/board-3.md`, `exports/board-3/list-6.md`) — every export of a board's lists or tasks goes into that board's folder, never loose in `exports/`. At session start, read the exports relevant to the work instead of re-querying or guessing board state; refresh them with `export-markdown --out memory-bank/exports/<board-id>/...` when you need a current view or before writing context-dependent notes. Hand-written memory-bank files should cover only what cannot be derived from the board itself (decisions, rationale, external constraints) — never duplicate card content that an export already provides.

## Recording completed work as a Taskitty task

Use this section only when a user asks to record completed work as a Taskitty task. Do not create a task merely because work was performed.

Target the database declared in `taskitty.json` at the project root — see **Local API → Workspaces**.

1. **API running + token available**: run `<folder>\taskitty.bat start` from wherever Taskitty's final build lives (idempotent). The desktop Taskitty application does not need to be open; the API may run as a background process. Generate the token **before** starting on Windows — see **Local API → Token**.
2. Run `boards` to see available boards, then `board <id>` on the target board to discover list IDs. Ask the user which board/list to use if no sensible documentation list is obvious.
3. Create the task with `add <list_id> "<concise title>"`. The client prints the new task ID, then assign a fitting tag and member to it as for any other card (see *Creating a task*, step 6).
4. Record the completion summary as a **finishing comment** in the structured Reflections format — use `reflections <task_id> [--cause ...] [--solution ...] [--troubles ...] [--findings ...] [--todos ...] [--other ...]` (each section accepts inline text or an `@file` payload; keep normal comments for progress updates while work is in flight). The command composes the filled sections into one card comment (`Title: text` lines) and can mirror the desktop panel's side effects with `--blog` (draft note saved to Notes) and `--follow-up` (a "Follow-up: <task>" card in the same list, description from Todos/Other). Fill the sections that apply:
   - **Cause**: why this task existed — the reason or problem that led to it
   - **Solution**: what was done to solve it; include the relevant files created or modified here
   - **Troubles**: what you struggled with most (omit when nothing notable)
   - **Findings**: pitfalls and lessons learned; record verification evidence here too (compile, test, API response, E2E run) — be explicit about what was actually verified
   - **Todos**: what could still be improved / follow-up work
   - **Other**: anything else worth recording

   When marking a task done through the API (`done <task_id>`), always write this finishing comment right after it — the desktop app shows the same panel in its UI, but API clients must post the note themselves. Set a description with `description` only when the card needs standing reference info.
5. Mark the card done: `done <task_id>`.
6. Refetch the board after creating/updating the task when its resulting ID or placement matters — reporting names alongside ids per **Report names with ids** — and state any incomplete verification plainly (see Ground rules).
