# Taskitty CLI Reference

Use the bundled CLI for all Taskitty operations. Never call the API directly.

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
- Todos: remaining or follow-up work
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

create-list <board_id> "Backlog"
delete-list <list_id>

Deleting a list also deletes its tasks through the database foreign-key cascade.

## Attachments

attach <task_id> <file>
comment-attach <comment_id> <file>

`attach` uploads the file and sets it as the task cover.

## Project configuration

project-config [directory] [--replace] [--board-id N --board-name "name"] [--author-id N --author-name "name"]

PowerShell uses named parameters such as:

taskitty.ps1 project-config -Replace -BoardId 2 -BoardName "My Project"

See `workspace.md` for configuration behavior.

## Markdown export

export-markdown ["<board_id>"] [--scope board|list|task] [--format lists|single] [--list-id N] [--task-id N] [--out file.md|dir/]

PowerShell filters:

-Tags id,id
-Members id,id
-Milestones id,id
-Versions v1,v2
-Due any|overdue|today
-HideHidden

`board` is the default scope.

`list` requires `--list-id`.

`task` requires `--task-id`.

`--format` controls packaging (default `lists`):

- `lists` — a `board-<id>.md` list index, one `list-<id>.md` task index per visible list, and one full-detail `task-<id>.md` per matching task (hidden lists skipped when `-HideHidden`). Board scope only; needs `--out <dir>` to write the files.
- `single` — one combined file for the whole board (or the single list/task file).

Without `--out`, a single-file export is written to stdout; a multi-file export requires `--out <dir>`.

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
