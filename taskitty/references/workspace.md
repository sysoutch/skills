# Taskitty Workspace Reference

## Workspace selection

Task actions resolve their workspace in this order:

1. Explicit `--workspace <path>` / `-Workspace <path>`
2. `databasePath` from `./taskitty.json`
3. Taskitty's persisted active workspace

Only registered Taskitty workspace paths are valid.

Never invent a database path or point Taskitty at an arbitrary SQLite file.

## taskitty.json

A project may contain `taskitty.json` at its root.

Example:

{
  "databasePath": "C:\\path\\to\\project.sqlite",
  "boardId": 3,
  "boardName": "My Project",
  "authorId": 4,
  "authorName": "Agent"
}

Fields:

- `databasePath` — registered workspace database
- `boardId` — default documentation board
- `boardName` — name corresponding to `boardId`
- `authorId` — default author for created tasks/comments
- `authorName` — name corresponding to `authorId`

The file may contain only some of these fields.

IDs are scoped to a workspace.

## Project defaults

When the CLI runs from a project containing `taskitty.json`:

- Task actions use `databasePath`.
- `board` can use `boardId` when no board ID is supplied.
- `tags` and `create-tag` can use the configured board.
- `add` and `comment` can use the configured author.

Explicit command-line values always take precedence.

An explicit workspace override must not inherit board or author defaults from another project's configuration.

## Creating taskitty.json

CLI:

project-config [directory] [--replace]

Optional board:

project-config [directory] --board-id N --board-name "name"

Optional author:

project-config [directory] --author-id N --author-name "name"

Without `--workspace`, the configuration uses the API's active registered workspace.

The target directory must already exist.

Replacing an existing `taskitty.json` requires `--replace`.

PowerShell equivalents use:

- `-Replace`
- `-BoardId`
- `-BoardName`
- `-AuthorId`
- `-AuthorName`
- `-Workspace`

## Desktop configuration

The desktop application can create the file through:

Workspaces → select workspace → Add existing database → select project folder → Link this project → Create taskitty.json here

The user can select:

- the project's default board
- an optional default author

Native confirmation is required when creating or replacing the file.

This filesystem flow is desktop-only.

## API URL

The CLI resolves the API URL in this order:

1. `TASKITTY_API_URL`
2. `%APPDATA%\taskitty\api-server-url`
3. default loopback endpoint

Default:

http://127.0.0.1:38473

The API is loopback-only.

## API token

The token is stored at:

%APPDATA%\taskitty\api-token

Never:

- print it
- log it
- commit it
- put it in task content
- put it in chat output

If the token does not exist, start the local API once or obtain it through the desktop Settings surface.

## API executable

Only `start` launches `taskitty-api`.

Resolution order:

1. `TASKITTY_API_EXE`
2. `%APPDATA%\taskitty\api-server-path`
3. Taskitty installer registry entry
4. directory beside the CLI script

Use:

<t> which

to inspect what was resolved.

All other CLI actions are HTTP-only and do not launch executables.

## Shared API state

The desktop app and CLI share:

%APPDATA%\taskitty\api.pid

%APPDATA%\taskitty\api-token

and the API log.

Therefore an API started by the CLI is visible to the desktop application and vice versa.
