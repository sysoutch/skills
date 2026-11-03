#!/usr/bin/env node
// Claude Code hook: keeps the Taskitty board honest in every project that has a taskitty.json.
// One script for three events, wired up in ~/.claude/settings.json:
//   UserPromptSubmit  reminds Claude which tools to use for the request
//   PostToolUse       counts file changes since the board was last touched
//   Stop              refuses to end a turn that changed files without touching the board
// It must never get in the way of work, so anything unexpected exits quietly.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const WRITE_TOOLS = /^mcp__taskitty__taskitty_(start_work|finish_work|capture|create_task|update_task|set_task_state|move_task|add_comment|add_reflection)$/;
const CHANGES_FILES = /\bsed\s+-i\b|\bpython3?\s|\btee\s|Set-Content|Add-Content|Out-File|(^|[^0-9&>-])>>?\s*[^\s&$]/;
const NOT_A_FILE = /\d?>&\d|\d?>\s*\/dev\/null|\d?>\s*\$null/g;
const LOAD_TOOLS = 'ToolSearch query "select:mcp__taskitty__taskitty_start_work,mcp__taskitty__taskitty_finish_work,mcp__taskitty__taskitty_capture"';

function projectRoot(from) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "taskitty.json"))) return dir;
    if (dir === path.dirname(dir)) return null;
  }
}

function inside(file, root) {
  const relative = path.relative(root, path.resolve(root, file));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function stateFile(session) {
  const dir = path.join(os.tmpdir(), "taskitty-guard");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${String(session || "default").replace(/[^\w-]/g, "_")}.json`);
}

function loadState(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return { changes: 0, working: false }; }
}

function reply(value) { process.stdout.write(JSON.stringify(value)); }

function context(event, text) { reply({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }); }

function changedFiles(input, root) {
  const name = input.tool_name, tool = input.tool_input || {};
  if (name === "Edit" || name === "Write" || name === "NotebookEdit") {
    const file = tool.file_path || tool.notebook_path;
    return !!file && inside(file, root) && !path.relative(root, path.resolve(root, file)).startsWith("memory-bank");
  }
  if (name === "Bash" || name === "PowerShell") return CHANGES_FILES.test(String(tool.command || "").replace(NOT_A_FILE, ""));
  return false;
}

function handle(input) {
  const root = projectRoot(input.cwd || process.cwd());
  if (!root) return;
  const file = stateFile(input.session_id), state = loadState(file), event = input.hook_event_name;
  const save = () => writeFileSync(file, JSON.stringify(state));

  if (event === "UserPromptSubmit") {
    const workspace = JSON.parse(readFileSync(path.join(root, "taskitty.json"), "utf8")).databasePath;
    context(event, `This project tracks work in Taskitty (workspace ${workspace}). If this request changes files, call taskitty_start_work before the first edit and taskitty_finish_work when it is verified. A new request that arrives mid-task gets taskitty_capture right away. If those tools are deferred, load them with ${LOAD_TOOLS}.`);
    return;
  }

  if (event === "PostToolUse") {
    if (WRITE_TOOLS.test(input.tool_name)) {
      state.changes = 0;
      state.working = !/finish_work/.test(input.tool_name);
      save();
      return;
    }
    if (!changedFiles(input, root)) return;
    state.changes++;
    save();
    if (state.changes === 1 && !state.working) context(event, `No Taskitty task is open for this work yet. Call taskitty_start_work now, before going further. If it is deferred, load it with ${LOAD_TOOLS}.`);
    return;
  }

  if (event === "Stop") {
    const unlogged = state.changes > 0;
    state.changes = 0;
    save();
    // Asked once. If Claude has a reason not to, the turn still ends.
    if (unlogged && !input.stop_hook_active) reply({ decision: "block", reason: `Files changed since the Taskitty board was last updated. Before ending the turn, update it: taskitty_finish_work for finished work (with how it was verified), taskitty_start_work for work still going, or taskitty_capture for anything left over. If they are deferred, load them with ${LOAD_TOOLS}.` });
  }
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  try { handle(JSON.parse(raw)); } catch { /* A broken hook must never stop the work. */ }
});
