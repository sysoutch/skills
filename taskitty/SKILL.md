---
name: taskitty
description: Manage development tasks, projects, and local automation through Taskitty's bundled CLI and local API.
---

# Taskitty

Use Taskitty to track development work.

## When to use

Use this skill when:
- starting or resuming development work;
- creating or updating Taskitty tasks;
- recording completed work;
- managing Taskitty boards, lists, tags, or members;
- using Taskitty's local API;
- exporting Taskitty state to Markdown.

## Core rules

- Use the bundled CLI for every Taskitty operation. Never use raw HTTP.
- Create one task per meaningful deliverable.
- Before starting work, the task must have a useful title, description, tag, member, start date, due date, and `doing` status.
- Keep task metadata current as scope changes.
- Use comments for progress and `reflections` for completion.
- Write the finishing reflection before marking the task `done`.
- Never expose the API token.
- Never claim verification that was not performed.
- Report Taskitty IDs together with their names.

## Starting work

1. Resolve the bundled CLI using `references/cli.md`.
2. If the project has `taskitty.json`, read `references/workspace.md` and use its configured workspace and board.
3. Read `references/memory-bank.md` and the relevant exports before starting.
4. Ensure the API is running.
5. Inspect the board and choose the appropriate list.
6. Create or update the task.
7. Set its metadata and mark it `doing`.
8. Do the work and record progress in comments.
9. Record progress when useful.
10. Finish with a `reflections` comment.
11. Mark the task `done`.
12. Refetch the board if workflow routing may have moved the task.

## Existing tasks

When resuming an existing task, first normalize its title, description, tags, members, start date, and due date, then mark it `doing`.

## Completed work

If the user explicitly asks to record already-completed work, create a task representing that work, add a `reflections` completion record, and mark it `done`.

Do not create a task merely because work was performed.

## CLI

See `references/cli.md` for the complete command reference.

## Workspace

See `references/workspace.md` for `taskitty.json`, workspace selection, and project configuration.

## Memory-bank

Read `references/memory-bank.md` before using or updating its exports.

Taskitty Markdown exports are the source of truth for board-derived state. Keep them under:

`memory-bank/exports/<board-id>/` (can be overwritten by the user in `resources/config.json`).

Use hand-written memory-bank files only for context that cannot be derived from Taskitty.

## References

- `references/cli.md` — complete CLI command reference.
- `references/workspace.md` — workspace selection and `taskitty.json`.
- `references/memory-bank.md` — Markdown exports and memory-bank conventions.
