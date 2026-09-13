# Taskitty Memory Bank Reference

## Export location

Projects should store Taskitty exports under:

memory-bank/exports/<board-id>/

but this can be override by the user in the `.agents/skills/taskitty/resources/config.json` with 

Example:

memory-bank/
└── exports/
    └── board-3/
        ├── board-3.md
        ├── list-6.md
        └── task-44.md

Never put board/list/task exports directly in `memory-bank/exports/`.

## Session startup

1. Read the relevant exports before starting work.
2. Refresh them if stale.
3. Use them as the current snapshot of board state.
4. Treat the exports as the current session's board-state context. Avoid re-deriving information already present in them until a new session or context compaction, unless the underlying board state has changed.

Refresh with (per-list files, the default):

<t> export-markdown <board_id> --out memory-bank/exports/<board-id>/

This writes a `board-<id>.md` list index, one `list-<id>.md` task index per
visible list, and one full-detail `task-<id>.md` per matching task into that
folder. For a single board index file use:

<t> export-markdown <board_id> --format single --out memory-bank/exports/<board-id>/board-<board_id>.md

## Export contents

Board exports include only the board's lists. List exports include only task
names (with stable IDs). Task exports include the complete task information:

- export timestamp
- active-filter summary
- lists in board order
- description
- checklists
- comments

Exports are rendered from the complete database graph, not only cards currently loaded by the GUI.

## Export scopes

Board:

<t> export-markdown <board_id> --scope board

List:

<t> export-markdown <board_id> --scope list --list-id <list_id>

Task:

<t> export-markdown <board_id> --scope task --task-id <task_id>

Use `--out` to write the result to a file. Board scope also accepts `--format lists|single` (default `lists`, a board/list/task hierarchy).

## Filters

The export command supports filters matching the GUI:

--Tags id,id
--Members id,id
--Milestones id,id
--Versions v1,v2
--Due any|overdue|today
--HideHidden

Empty selections leave that filter disabled.

Tags, members, and milestones use any-match behavior.

`--HideHidden` excludes hidden lists and cards.

## Hand-written memory-bank files

Use hand-written notes only for information that cannot be derived from Taskitty.

Do not re-document completed work in hand-written files when it is already documented as a Taskitty task. The task record — description, progress comments, and finishing reflection — is the durable account of that work; repeating it in session-context or progress notes creates a second source that drifts from the board. A short pointer (card name + id) for orientation is fine; restating its content is not.

Good candidates:

- architectural decisions
- rationale
- external constraints
- decisions made outside Taskitty
- durable context

Do not duplicate Taskitty data such as:

- task descriptions
- status
- dates
- tags
- members
- comments
- board/list structure

Taskitty exports are the source of truth for that information.
