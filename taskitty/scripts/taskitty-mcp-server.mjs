#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const configuredCli = (process.env.TASKITTY_CLI || path.join(scriptDirectory, "taskitty-launcher.cjs")).trim();
const projectDirectory = process.env.TASKITTY_PROJECT_DIR ? path.resolve(process.env.TASKITTY_PROJECT_DIR) : process.cwd();
const defaultWorkspace = (process.env.TASKITTY_WORKSPACE || "").trim();
if (!existsSync(configuredCli)) throw new Error(`Taskitty CLI was not found: ${configuredCli}. Set TASKITTY_CLI to taskitty-launcher.cjs.`);

const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const positiveInteger = { type: "integer", minimum: 1 };
const optionalWorkspace = { type: "string", minLength: 1, description: "Optional registered Taskitty database path. Omit to use taskitty.json or the active workspace." };
const instructions = "Use these MCP tools first for Taskitty work; they invoke the bundled CLI and never expose its API token. Inspect the board and affected task before changing it. Keep title, description, tags, members, start and due dates current. Use add_reflection before marking completed work done. Do not use raw HTTP, browser automation, Playwright, arbitrary commands, destructive CLI actions, or unregistered workspaces.";
const tools = [
  { name: "taskitty_health", description: "Check whether the configured Taskitty local API is reachable through the bundled CLI.", inputSchema: object({}) },
  { name: "taskitty_list_boards", description: "List accessible Taskitty boards.", inputSchema: object({ workspace: optionalWorkspace }) },
  { name: "taskitty_get_board", description: "Get a board and its lists. Omit boardId only when taskitty.json configures one.", inputSchema: object({ boardId: positiveInteger, workspace: optionalWorkspace }) },
  { name: "taskitty_list_tasks", description: "List tasks in one Taskitty list.", inputSchema: object({ listId: positiveInteger, workspace: optionalWorkspace }, ["listId"]) },
  { name: "taskitty_get_task", description: "Get a Taskitty task with its details and comments.", inputSchema: object({ taskId: positiveInteger, workspace: optionalWorkspace }, ["taskId"]) },
  { name: "taskitty_list_tags", description: "List tags for a board. Omit boardId only when taskitty.json configures one.", inputSchema: object({ boardId: positiveInteger, workspace: optionalWorkspace }) },
  { name: "taskitty_list_members", description: "List available Taskitty members.", inputSchema: object({ workspace: optionalWorkspace }) },
  { name: "taskitty_create_task", description: "Create a task in an existing list. Inspect the board first, then set metadata and status deliberately.", inputSchema: object({ listId: positiveInteger, title: { type: "string", minLength: 1, maxLength: 500 }, description: { type: "string", maxLength: 50000 }, workspace: optionalWorkspace }, ["listId", "title"]) },
  { name: "taskitty_update_task", description: "Update a task title, description, start date, or due date. Use ISO-8601 UTC dates, or clear to remove a date.", inputSchema: object({ taskId: positiveInteger, title: { type: "string", minLength: 1, maxLength: 500 }, description: { type: "string", maxLength: 50000 }, startDate: { type: "string", minLength: 1 }, dueDate: { type: "string", minLength: 1 }, workspace: optionalWorkspace }, ["taskId"]) },
  { name: "taskitty_set_task_state", description: "Set one task state. Re-read the board afterwards because workflow routing can move the task.", inputSchema: object({ taskId: positiveInteger, state: { type: "string", enum: ["doing", "not_doing", "done", "not_done", "on_hold", "not_on_hold"] }, workspace: optionalWorkspace }, ["taskId", "state"]) },
  { name: "taskitty_set_task_tag", description: "Add or remove one existing tag from a task.", inputSchema: object({ taskId: positiveInteger, tagId: positiveInteger, present: { type: "boolean" }, workspace: optionalWorkspace }, ["taskId", "tagId", "present"]) },
  { name: "taskitty_add_comment", description: "Add a progress comment to a task.", inputSchema: object({ taskId: positiveInteger, message: { type: "string", minLength: 1, maxLength: 50000 }, workspace: optionalWorkspace }, ["taskId", "message"]) },
  { name: "taskitty_add_reflection", description: "Create Taskitty's structured finishing reflection. Call before setting a task done; every non-empty todos line creates a new task.", inputSchema: object({ taskId: positiveInteger, cause: { type: "string", maxLength: 50000 }, solution: { type: "string", maxLength: 50000 }, troubles: { type: "string", maxLength: 50000 }, findings: { type: "string", maxLength: 50000 }, todos: { type: "string", maxLength: 50000, description: "Optional; omit or pass an empty string for no follow-up tasks. Every non-empty line creates one new task." }, other: { type: "string", maxLength: 50000 }, createBlogPost: { type: "boolean" }, createFollowUpTask: { type: "boolean" }, workspace: optionalWorkspace }, ["taskId"]) },
  { name: "taskitty_export_board", description: "Export board state to Markdown. outputDirectory must be inside the project memory-bank/exports directory.", inputSchema: object({ boardId: positiveInteger, outputDirectory: { type: "string", minLength: 1 }, workspace: optionalWorkspace }, ["boardId", "outputDirectory"]) },
];

function requireText(value, label) { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`); return value.trim(); }
function optionalText(value, label) { return value === undefined ? undefined : requireText(value, label); }
function positive(value, label) { const result = Number(value); if (!Number.isInteger(result) || result <= 0) throw new Error(`${label} must be a positive integer.`); return String(result); }
function workspaceArgs(value) { const workspace = optionalText(value, "workspace") || defaultWorkspace; return workspace ? ["--workspace", workspace] : []; }
function safeOutputPath(value) {
  const target = path.resolve(projectDirectory, requireText(value, "outputDirectory"));
  const memoryRoot = path.resolve(projectDirectory, "memory-bank", "exports");
  if (target !== memoryRoot && !target.startsWith(`${memoryRoot}${path.sep}`)) throw new Error("outputDirectory must be inside this project's memory-bank/exports directory.");
  return target;
}
function runCli(action, args, workspace) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [configuredCli, action, ...args, ...workspaceArgs(workspace)], { cwd: projectDirectory, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => { const output = `${stdout}${stderr}`.trim(); code !== 0 ? reject(new Error(output || `Taskitty CLI exited with code ${code}.`)) : resolve(output || "Taskitty command completed."); });
  });
}
async function runSequence(steps, workspace) { const output = []; for (const [action, args] of steps) output.push(await runCli(action, args, workspace)); return output.join("\n"); }
async function call(name, args = {}) {
  switch (name) {
    case "taskitty_health": return runCli("health", [], args.workspace);
    case "taskitty_list_boards": return runCli("boards", [], args.workspace);
    case "taskitty_get_board": return runCli("board", args.boardId === undefined ? [] : [positive(args.boardId, "boardId")], args.workspace);
    case "taskitty_list_tasks": return runCli("list-tasks", [positive(args.listId, "listId")], args.workspace);
    case "taskitty_get_task": return runCli("task", [positive(args.taskId, "taskId")], args.workspace);
    case "taskitty_list_tags": return runCli("tags", args.boardId === undefined ? [] : [positive(args.boardId, "boardId")], args.workspace);
    case "taskitty_list_members": return runCli("members", [], args.workspace);
    case "taskitty_create_task": {
      const output = await runCli("add", [positive(args.listId, "listId"), requireText(args.title, "title")], args.workspace);
      const taskId = output.match(/Created task id=(\d+)/)?.[1];
      return !taskId || args.description === undefined ? output : `${output}\n${await runCli("description", [taskId, requireText(args.description, "description")], args.workspace)}`;
    }
    case "taskitty_update_task": {
      const taskId = positive(args.taskId, "taskId"); const steps = [];
      if (args.title !== undefined) steps.push(["rename", [taskId, requireText(args.title, "title")]]);
      if (args.description !== undefined) steps.push(["description", [taskId, requireText(args.description, "description")]]);
      if (args.startDate !== undefined) steps.push(["start-date", [taskId, requireText(args.startDate, "startDate")]]);
      if (args.dueDate !== undefined) steps.push(["due-date", [taskId, requireText(args.dueDate, "dueDate")]]);
      if (!steps.length) throw new Error("Provide at least one field to update.");
      return runSequence(steps, args.workspace);
    }
    case "taskitty_set_task_state": {
      const action = { doing: "doing", not_doing: "off_doing", done: "done", not_done: "undone", on_hold: "on_hold", not_on_hold: "off_on_hold" }[requireText(args.state, "state")];
      if (!action) throw new Error("state is invalid.");
      return runCli(action, [positive(args.taskId, "taskId")], args.workspace);
    }
    case "taskitty_set_task_tag": return runCli(args.present === true ? "tag-task" : "untag-task", [positive(args.taskId, "taskId"), positive(args.tagId, "tagId")], args.workspace);
    case "taskitty_add_comment": return runCli("comment", [positive(args.taskId, "taskId"), requireText(args.message, "message")], args.workspace);
    case "taskitty_add_reflection": {
      const flags = [];
      for (const property of ["cause", "solution", "troubles", "findings", "todos", "other"]) { const value = args[property]; if (value === undefined || String(value).trim() === "") continue; flags.push(`--${property}`, requireText(value, property)); }
      if (args.createBlogPost === true) flags.push("--blog");
      if (args.createFollowUpTask === true) flags.push("--follow-up");
      return runCli("reflections", [positive(args.taskId, "taskId"), ...flags], args.workspace);
    }
    case "taskitty_export_board": return runCli("export-markdown", [positive(args.boardId, "boardId"), "--out", safeOutputPath(args.outputDirectory)], args.workspace);
    default: throw new Error(`Unknown MCP tool: ${name}`);
  }
}
function send(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function respond(id, value) { send({ jsonrpc: "2.0", id, result: value }); }
function fail(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }
async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") throw new Error("Expected a JSON-RPC 2.0 request.");
  if (message.method === "notifications/initialized") return;
  if (message.method === "initialize") return respond(message.id, { protocolVersion: message.params?.protocolVersion || "2024-11-05", capabilities: { tools: {} }, instructions, serverInfo: { name: "taskitty", version: "1.0.0" } });
  if (message.method === "ping") return respond(message.id, {});
  if (message.method === "tools/list") return respond(message.id, { tools });
  if (message.method === "tools/call") return respond(message.id, { content: [{ type: "text", text: String(await call(requireText(message.params?.name, "Tool name"), message.params?.arguments ?? {})) }] });
  fail(message.id ?? null, -32601, `Unsupported MCP method: ${message.method}`);
}
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message; try { message = JSON.parse(line); } catch { fail(null, -32700, "Invalid JSON-RPC message."); return; }
  handle(message).catch((error) => { const text = error instanceof Error ? error.message : "Taskitty MCP request failed."; if (message.id !== undefined) fail(message.id, -32000, text); else process.stderr.write(`${text}\n`); });
});
