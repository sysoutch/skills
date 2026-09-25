---
name: taskitty
description: Use the Taskitty MCP server to inspect and update local Taskitty boards and tasks. Fall back to the bundled CLI only when MCP is unavailable.
---

# Taskitty

Use the configured `taskitty` MCP server first. It exposes safe, typed Taskitty operations through the bundled CLI; it does not expose the local API token or arbitrary shell commands. Workspace and workspace-group management (list/create) is included, so registry changes never need raw HTTP either.

## Workspace selection (always explicit)

The user can change the globally active workspace at any time from the Taskitty GUI, so an MCP call without a `workspace` argument may silently hit the wrong database ("task not found", wrong board). Therefore: when `taskitty.json` exists in the project root, pass its `databasePath` as the explicit `workspace` argument on every taskitty MCP call (list_boards, get_board, list_tasks, get_task, create/update/comment/reflection/state/tag, export, ...). Omit it only when the user explicitly names a different workspace. The bundled CLI/launcher scripts already auto-select `taskitty.json`, so this rule applies to the MCP tools.

Inspect the board and affected task before changing it. Keep title, description, tags, members, start date, and due date current. Add progress as comments. Before marking work done, save a structured reflection with accurate findings; non-empty reflection todos create follow-up tasks and leave a reference to the initial task with #tk:task-<id>. Re-read the board after a workflow state change because routing may move the task. Never guess or assume the id of a newly created board, list, task, tag, member, or comment — other items may have been added in the meantime; use only the `id=` value returned by the creation command, or re-list and match by name to find it.

Never use raw HTTP, browser automation, Playwright, destructive deletes, or a made-up command for Taskitty. Use only registered workspaces.

## Session start (memory bank)

Before working on Taskitty-tracked projects, read this project's exports under `memory-bank/exports/<board-id>/` and treat them as the current board snapshot; refresh with `taskitty_export_board` when stale. The MCP export removes stale files automatically; the CLI fallback needs `--clean`. For LLM runs that only need recent work, pass `maxAgeDays`/`limit` to keep the snapshot small. See `references/memory-bank.md` for layout and rules.

## Human review (Under Review)

Boards created from Taskitty's default list template include an **Under Review** list — the parking lane for work that needs a human decision. When you reach such a point, do not block waiting for instructions:

1. Move the task to the board's `Under Review` list (`taskitty_move_task`; look up the list id by name with `get_board`). If the board has no such list yet, create it first (CLI fallback: `taskitty create-list <board_id> "Under Review"`).
2. Add a comment stating exactly which decision is needed and what you tried or considered.
3. Apply an appropriate tag (create one if the board lacks a fitting one) so the task stays findable.

Leave the task in `Under Review` until a human moves it on; do not mark it done yourself.

## Setup and fallback

Run [`scripts/install-taskitty-mcp.ps1`](scripts/install-taskitty-mcp.ps1) for Cline or [`scripts/install-taskitty-codex-mcp.ps1`](scripts/install-taskitty-codex-mcp.ps1) for Codex, then restart the host. The installers globally install a portable `taskitty-mcp` command, so host configuration contains no machine-specific skill path.

If MCP is unavailable, use the bundled CLI from this skill directory. It reads `taskitty.json` in the current project when present; otherwise use an explicit registered workspace.

```sh
node .agents/skills/taskitty/scripts/taskitty-launcher.cjs health
node .agents/skills/taskitty/scripts/taskitty-launcher.cjs boards
```

```powershell
.\.agents\skills\taskitty\scripts\taskitty.ps1 health
.\.agents\skills\taskitty\scripts\taskitty.ps1 boards
```

See `references/cli.md` only when MCP is unavailable or a supported MCP operation is missing.