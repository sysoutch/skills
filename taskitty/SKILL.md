---
name: taskitty
description: Use the Taskitty MCP server to inspect and update local Taskitty boards and tasks. Fall back to the bundled CLI only when MCP is unavailable.
---

# Taskitty

## Combined default workflow

Use the **skill and MCP together**, with distinct responsibilities:

- The **skill** establishes the target project, reads its `taskitty.json` and
  memory-bank export, chooses and tracks the work item, and applies the
  lifecycle and truthful-verification rules below.
- The **MCP** is the only interface for reading or changing Taskitty data. It
  performs the typed, registered-workspace operations; it is not a substitute
  for project selection, session context, or implementation judgment.

Default sequence: find the target project's `taskitty.json`; read the current
board export; use MCP with that config's `databasePath` on every
workspace-scoped call; inspect the board/task; transition an implementation
task to `doing`; implement and verify; add a factual progress comment and
reflection; then either mark it `done` or use **Under Review** for a genuine
human decision. Do not use the CLI merely because it is more convenient: it is
only the MCP-unavailable fallback.

## Skill location

For users who have it installed, `%USERPROFILE%\.agents\skills\taskitty` is the source of truth. Run its helpers and read its references from that global folder so host-relative and repository-relative skill paths cannot be confused. The checked-in `.agents\skills\taskitty` copy is a compatibility mirror for this repository; use it only when the global skill is unavailable, and keep both copies synchronized when this skill changes.

## Project context

An absolute helper path does not change the process working directory. Invoke the global helper while the shell is at the target project root: it reads that directory's `taskitty.json` and resolves relative payload, attachment, and export paths there. To target another project, change location explicitly (for example, `Push-Location C:\Path\To\Project` before the command and `Pop-Location` afterward); `--workspace` selects a database but does not change where relative files are read.

Use the configured `taskitty` MCP server for all Taskitty reads and writes. It
exposes safe, typed operations through the bundled CLI; it does not expose the
local API token or arbitrary shell commands. Workspace and workspace-group
management (list/create) is included, so registry changes never need raw HTTP
either.

## Workspace selection (always explicit)

The user can change the globally active workspace at any time from the Taskitty
GUI, so an implicit workspace can silently hit the wrong database. Read the
target project's `taskitty.json`, then pass its `databasePath` as `workspace`
on **every workspace-scoped MCP call** (boards, board/task/list reads, task
creates/updates/state/tags/comments/reflections/moves, exports, and reports).
The MCP intentionally requires this field; do not rely on its host process
directory, a `TASKITTY_WORKSPACE` environment variable, or Taskitty's active
workspace. Only registry-level workspace/group operations and `taskitty_health`
have no workspace.

If the current checkout has no `taskitty.json`, it is an umbrella or unrelated
directory, not an implicit target. Find the intended child/project config or
ask which registered project should be targeted before any workspace-scoped
MCP call. A CLI fallback may auto-select a config from its current directory,
but still pass `--workspace` explicitly whenever practical.

Inspect the board and affected task before changing it. Keep title, description, tags, members, start date, and due date current. Add progress as comments. Before marking work done, save a structured reflection with accurate findings; non-empty reflection todos create follow-up tasks and leave a reference to the initial task with #tk:task:<id>. Re-read the board after a workflow state change because routing may move the task. Never guess or assume the id of a newly created board, list, task, tag, member, or comment — other items may have been added in the meantime; use only the `id=` value returned by the creation command, or re-list and match by name to find it. The same command response also carries the server-stamped `added_datetime` (and `edited_datetime`/`last_activity_datetime`) for the new task — report that creation datetime from the response instead of re-reading the task or guessing from the local clock. Likewise, marking a task done returns the server-stamped `done_datetime` in the same response — report the completion datetime from it rather than re-reading the task.

## Task lifecycle (required)

When beginning implementation of an existing Taskitty task, immediately set its state to `doing` through `taskitty_set_task_state` and re-read it to confirm its routed list/state. Do this before making implementation changes, unless it is already `done`, `on_hold`, or explicitly awaiting review.

When the requested work is implemented and verified to the appropriate boundary, add the factual progress comment and structured finishing reflection, then set the task state to `done` yourself. Do not wait for the user merely to move a completed task. Human attention is required only for a real unresolved decision, external authority, missing input, or failed verification that prevents a truthful completion claim. In those cases, use the **Under Review** workflow below instead of setting `done`.

Never use raw HTTP, browser automation, Playwright, destructive deletes, or a made-up command for Taskitty. Use only registered workspaces.

## Session start (memory bank)

Before working on Taskitty-tracked projects, read this project's exports under `memory-bank/exports/<board-id>/` and treat them as the current board snapshot; refresh with `taskitty_export_board` when stale. The MCP export removes stale files automatically; the CLI fallback needs `--clean`. For a globally installed MCP process, use an absolute project export path so it does not resolve against the host application's directory. For LLM runs that only need recent work, pass `maxAgeDays`/`limit` to keep the snapshot small. See `references/memory-bank.md` for layout and rules.

## Human review (Under Review)

Boards created from Taskitty's default list template include an **Under Review** list — the parking lane for work that needs a human decision. When you reach such a point, do not block waiting for instructions:

1. Move the task to the board's `Under Review` list (`taskitty_move_task`; look up the list id by name with `get_board`). If the board has no such list yet, create it first (CLI fallback: `taskitty create-list <board_id> "Under Review"`).
2. Add a comment stating exactly which decision is needed and what you tried or considered.
3. Apply an appropriate tag (create one if the board lacks a fitting one) so the task stays findable.

Leave the task in `Under Review` until a human moves it on; do not mark it done yourself.

## Setup and fallback

Run [`scripts/install-taskitty-mcp.ps1`](scripts/install-taskitty-mcp.ps1) for Cline or [`scripts/install-taskitty-codex-mcp.ps1`](scripts/install-taskitty-codex-mcp.ps1) for Codex, then restart the host. The installers globally install a portable `taskitty-mcp` command, so host configuration contains no machine-specific skill path.

If MCP is unavailable, use the global CLI helper. It reads `taskitty.json` in the current project when present; otherwise use an explicit registered workspace. If the global skill is unavailable, use the matching checked-in mirror.

```sh
node "$USERPROFILE/.agents/skills/taskitty/scripts/taskitty-launcher.cjs" health
node "$USERPROFILE/.agents/skills/taskitty/scripts/taskitty-launcher.cjs" boards
```

```powershell
& "$env:USERPROFILE\.agents\skills\taskitty\scripts\taskitty.ps1" health
& "$env:USERPROFILE\.agents\skills\taskitty\scripts\taskitty.ps1" boards
```

See `references/cli.md` only when MCP is unavailable or a supported MCP operation is missing.
