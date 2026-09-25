# Taskitty CLI Reference

Use the bundled CLI for all Taskitty operations. Never call the API directly.

## Newly created ids

Never guess or assume the id of a newly created board, list, task, tag, member, or comment — other items may have been added in the meantime, so ids are not predictable. Use only the `id=` value printed by the creation command; if you missed it, re-list (`boards`, `board`, `list-tasks`, `tags`, `members`) and match by name instead of assuming a number.

## CLI entry points

Windows without Node:

<folder>\taskitty.bat <action> [args]

PowerShell:

<folder>\taskitty.ps1 <action> [args]

Node 18+:

node <folder>/taskitty-launcher.cjs <action> [args]

Run `which` to inspect CLI/API resolution.

## Discovery

boards
board <board_id>
task <task_id>
list-tasks <list_id>
members
tags <board_id>
health

## Tasks

add <list_id> "Task name"
move <task_id> <list_id> [--target-workspace <path>]
rename <task_id> "New name"
description <task_id> "<markdown>"
delete <task_id>

doing <task_id>
off_doing <task_id>

done <task_id>
undone <task_id>

on_hold <task_id>
off_on_hold <task_id>

start-date <task_id> "<ISO-8601 UTC datetime>"
start-date <task_id> clear

due-date <task_id> "<ISO-8601 UTC datetime>"
due-date <task_id> clear

## Comments

comment <task_id> "<text>"
edit_comment <comment_id> "<new text>"
delete_comment <comment_id>

Use `@<path>` for free-text values when shell quoting or multiline content is inconvenient.

## Reflections

reflections <task_id> [options]

Available sections:

--cause
--solution
--troubles
--findings
--todos
--other

Optional:

--blog
--follow-up

`reflections` creates the structured finishing comment.

Use:

- Cause: why the work existed
- Solution: what changed, including relevant files
- Troubles: notable difficulties
- Findings: lessons and actual verification evidence
- Todos: remaining or follow-up work — each non-empty line becomes a new task in the list the card was in before completion (call `reflections` before `done`)
- Other: useful additional context

Do not claim verification that was not actually performed.

## Tags

tags <board_id>
create-tag <board_id> "name" [#rrggbb]
tag-task <task_id> <tag_id>
untag-task <task_id> <tag_id>

## Members

members
create-member "name" [description]
member-task <task_id> <member_id>
unassign-member <task_id> <member_id>
board-member <board_id> <member_id>
unassign-board-member <board_id> <member_id>

## Boards and lists

create-board "Project board" "Optional description"
delete-board <board_id>
move-board <board_id> --target-workspace <path>

create-list <board_id> "Backlog"
delete-list <list_id>
move-list <list_id> <board_id> [--target-workspace <path>]

Deleting a list also deletes its tasks through the database foreign-key cascade.

## Workspaces and groups

Registry-level actions (they manage %APPDATA%\taskitty\workspaces.json; --workspace does not apply):

workspace-groups
create-workspace "name" [--group-id N | --group-alias X]
create-group "name" [--parent-id N | --parent-alias X]

`workspace-groups` lists every named group with its id, stable alias and parent folder.

`create-workspace` creates a new empty workflow database in Taskitty's data directory and registers it (the desktop "New workspace" action). A pre-existing file with the same name is only adopted when it passes validation as a Taskitty database. The optional assignment takes an existing group by id or stable alias (`#tk:workspacegroup-<alias>` accepted); pass exactly one of the two flags.

`create-group` creates a named folder (the desktop "New folder" action). Sibling names are unique per parent (case-insensitive), and the stable alias is derived from the name at creation only — renaming never changes it. The optional parent takes an existing group by id or stable alias; omit both for a top-level folder.

PowerShell uses -GroupId / -GroupAlias and -ParentId / -ParentAlias instead of the --flags.

## Attachments

attach <task_id> <file>
comment-attach <comment_id> <file>

`attach` uploads the file and sets it as the task cover.

## Project configuration

project-config [directory] [--replace] [--author-id N --author-name "name"]

PowerShell uses named parameters such as:

taskitty.ps1 project-config -Replace -AuthorId 4 -AuthorName "Agent"

See `workspace.md` for configuration behavior.

## Markdown export

export-markdown <board_id> [--scope board|list|task] [--format lists|single] [--list-id N] [--task-id N] [--max-age-days N] [--limit N] [--clean] [--out file.md|dir/]

PowerShell filters:

-Tags id,id
-Members id,id
-Milestones id,id
-Versions v1,v2
-Due any|overdue|today
-HideHidden
-MaxAgeDays N
-Limit N
-Clean

`board` is the default scope.

`list` requires `--list-id`.

`task` requires `--task-id`.

`--format` controls packaging (default `lists`):

- `lists` — a `board-<id>.md` list index, one `list-<id>.md` task index per visible list, and one full-detail `task-<id>.md` per matching task (hidden lists skipped when `-HideHidden`). Board scope only; needs `--out <dir>` to write the files.
- `single` — one combined file for the whole board (or the single list/task file).

Without `--out`, a single-file export is written to stdout; a multi-file export requires `--out <dir>`.

Freshness and size limits (for LLM/API runs):

- `--max-age-days N` keeps only cards whose last activity is within N days. Last activity is the card's latest comment/edit timestamp (`last_activity_datetime`), falling back to its edited or added date when it has no comments yet.
- `--limit N` caps each list to its N most recently active cards, listed newest first; omitted matches are noted in the list index and their task files are not generated. Freshness is applied before the limit.

Stale export cleanup:

- `--clean` removes existing `board-*.md`, `list-*.md`, and `task-*.md` files from the output directory before writing, so a refresh never leaves behind task files that no longer match (for example after adding `--max-age-days` or `--limit`). Use it for every fresh LLM run; `delete-markdown <dir>` does the same sweep without exporting.

## API lifecycle

start
status
stop
token

`start` launches the installed `taskitty-api` sidecar when necessary.

`status` reports whether the API is running.

`stop` stops the recorded API process.

`token` reads the saved token. Never print or log it.

Only `start` launches the API executable. Other actions communicate with the configured API endpoint.

## Workspace override

Task actions accept:

--workspace <registered database path>

PowerShell:

-Workspace <registered database path>

Explicit workspace selection takes precedence over `taskitty.json`.

## Cross-workspace moves

`move`, `move-list`, and `move-board` accept a target workspace (a registered database path):

move <task_id> <list_id> --target-workspace <path>
move-list <list_id> <board_id> --target-workspace <path>
move-board <board_id> --target-workspace <path>

PowerShell uses -TargetWorkspace.

With a target workspace, the item is copied into that registered workspace first and then removed from the source:

- A task travels with its comments, checklists/todos, attachments, tags and members; it gets a new id in the destination.
- A list travels with every card as a full task (same related rows); `board_id` refers to a board in the *destination* workspace.
- A board travels with its lists, tags, members, cards and workflow rules; rule target lists are remapped onto the copied lists and a rule whose target did not travel is disabled.

Members and comment authors are remapped by name across workspaces; tags match case-insensitively against the destination board. Without a target workspace, `move` and `move-list` stay inside the resolved workspace (desktop semantics). `move-board` requires a target workspace — same-workspace board moves are not supported by the API.

## Workflow routing

When workflow routing is configured:

- `done` can move a task to the configured Done list.
- `doing` can move a task to the configured Doing list.
- `on_hold` can move a task to the configured On Hold list.
- `undone`, `off_doing`, and `off_on_hold` do not move the task back.

After `done`, `doing`, or `on_hold`, refetch the board when placement matters.

## Reporting

Always report Taskitty IDs together with human-readable names.

Prefer:

card "Ship CLI client" (id=44) in list "Done" (id=12) on board "My Project" (id=3)

Avoid reporting bare IDs such as:

list 12
card 44
