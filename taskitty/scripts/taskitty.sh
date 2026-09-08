#!/bin/sh
# Taskitty local API launcher + task CLI for Linux/macOS.
# Usage: ./taskitty <command> [args]  — lifecycle: start-api|stop-api (start/stop), status, health, token,
# tasks: boards, board, add, done, ... (run `./taskitty help` for the full list).
# Configure a release sidecar once: ./taskitty configure /path/to/taskitty-api
command -v node >/dev/null 2>&1 || { echo "Node.js is required - install it from https://nodejs.org" >&2; exit 1; }
exec node "$(dirname "$0")/taskitty-launcher.cjs" "$@"
