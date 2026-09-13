#!/usr/bin/env node
// Taskitty local API launcher + task CLI (Windows / Linux / macOS).
//
// Self-contained release tooling: it drives an installed Taskitty build and
// needs neither this repository, Cargo, nor npm. Ship the whole taskitty CLI
// folder anywhere - beside the executables, in a PATH folder, or point at them
// once with `configure`. On Windows without Node/npm, run taskitty.bat instead;
// it executes taskitty.ps1 (same actions) using only PowerShell. Inside this
// repo: npm run taskitty:<action>.
//
// Server executable resolution order (`which` prints exactly what was tried):
//   1. TASKITTY_API_EXE - exe path or its folder
//   2. saved path file <dataDir>/api-server-path, written by `configure` and by
//      the desktop app when its Settings overlay starts the API
//   3. Windows: Taskitty's installer registry entry (Uninstall DisplayName) ->
//      InstallLocation / DisplayIcon folder - finds installed builds anywhere
//   4. next to this script, then one folder up (portable layout)
// A source pointing at a missing file is skipped and the search continues, so a
// stale saved path falls through to the installer registry automatically.
//
// Server lifecycle: start | stop | status | health | token | which
// Task CRUD is an HTTP-only client. It talks to the configured endpoint (default
// http://127.0.0.1:38473) and never resolves or launches an executable. `start`
// is the sole action that runs taskitty-api.
//
//   node <path>/.agents/skills/taskitty/scripts/taskitty-launcher.cjs start|stop|status|token
//   node <path>/.agents/skills/taskitty/scripts/taskitty-launcher.cjs boards | board [board_id]
//   node <path>/.agents/skills/taskitty/scripts/taskitty-launcher.cjs add <list_id> "Task name"
//   node <path>/.agents/skills/taskitty/scripts/taskitty-launcher.cjs project-config [directory] [--replace]
//   ... (run `help` for the full list)
//
// Workspace selection - task actions target one registered database:
//   --workspace <path>          explicit override, accepted anywhere on the command line
//   ./taskitty.json             project default: its "databasePath", read from the cwd
// Without either, the API's globally persisted active workspace is used.
// Board-scoped actions (board/tags/create-tag) also accept an omitted <board_id>, which
// then defaults to that same config file's "boardId" - never across a --workspace override,
// because board ids are per-workspace. An explicit numeric id always wins.

'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const SCRIPT_DIR = __dirname;
const IS_WIN = process.platform === 'win32';

function dataDir() {
  const base = IS_WIN
    ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'taskitty');
}

const PID_FILE = path.join(dataDir(), 'api.pid');
const LOG_FILE = path.join(dataDir(), 'api-server.log');
const API_EXE_FILE = path.join(dataDir(), 'api-server-path');
const API_URL_FILE = path.join(dataDir(), 'api-server-url');
const TOKEN_FILE = path.join(dataDir(), 'api-token');
const EXE_NAME = IS_WIN ? 'taskitty-api.exe' : 'taskitty-api';

function normalizedApiUrl(value) {
  if (!value) return null;
  try {
    const endpoint = new URL(value.includes('://') ? value : `http://${value}`);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) return null;
    endpoint.pathname = endpoint.pathname.replace(/\/$/, '');
    endpoint.search = '';
    endpoint.hash = '';
    return endpoint.toString().replace(/\/$/, '');
  } catch { return null; }
}

function readSavedApiUrl() {
  try { return fs.readFileSync(API_URL_FILE, 'utf8').trim(); } catch { return null; }
}

const API_URL = normalizedApiUrl(process.env.TASKITTY_API_URL)
  || normalizedApiUrl(readSavedApiUrl())
  || `http://127.0.0.1:${Number(process.env.TASKITTY_API_PORT || 38473)}`;
const ENDPOINT = new URL(API_URL);
const HOST = ENDPOINT.hostname;
const PORT = Number(ENDPOINT.port || (ENDPOINT.protocol === 'https:' ? 443 : 80));
const LOCAL_ENDPOINT = ['127.0.0.1', 'localhost', '::1'].includes(HOST);

function fail(message) {
  console.error(`taskitty: ${message}`);
  process.exit(1);
}

function normalizedExePath(value) {
  if (!value) return null;
  const candidate = path.resolve(value);
  return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
    ? path.join(candidate, EXE_NAME)
    : candidate;
}

function readSavedApiExe() {
  try { return fs.readFileSync(API_EXE_FILE, 'utf8').trim(); } catch { return null; }
}

// Windows: an installed Taskitty build registers a standard Uninstall entry; its
// InstallLocation (or the DisplayIcon folder) is where taskitty.exe and the API
// sidecar live. `reg query /f` filters on key names and value data, so only
// entries that mention "Taskitty" come back.
function registryInstallDirs() {
  if (!IS_WIN) return [];
  const dirs = [];
  for (const hive of ['HKLM', 'HKCU']) {
    const bases = [`SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall`];
    if (hive === 'HKLM') bases.push(`SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall`);
    for (const base of bases) {
      let out;
      try {
        out = execSync(`reg query "${hive}\\${base}" /s /f "Taskitty"`, { encoding: 'utf8' });
      } catch (e) {
        // Missing key or no match exits non-zero; captured stdout may still hold hits.
        out = e && e.stdout ? String(e.stdout) : '';
      }
      let entry = null;
      const flush = () => {
        if (entry && /taskitty/i.test(entry.DisplayName || '')) {
          const dir = (entry.InstallLocation || '').trim()
            || (entry.DisplayIcon ? path.dirname(String(entry.DisplayIcon).trim()) : '');
          if (dir) dirs.push(path.resolve(dir));
        }
        entry = null;
      };
      for (const raw of String(out).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (/^HKEY_/i.test(line)) { flush(); entry = {}; continue; }
        // Value row: "Name    REG_SZ    data" (name padded, then type and data).
        const m = line.match(/^(\S+)\s{2,}(REG_(?:SZ|EXPAND_SZ))\s+(.+)$/);
        if (m && entry) entry[m[1]] = m[3].trim();
      }
      flush();
    }
  }
  return [...new Set(dirs)];
}

// Ordered sources for the API executable; configuredApiExe() returns the first
// one that still points at an existing file.
function apiExeSources() {
  const sources = [
    { label: 'TASKITTY_API_EXE', value: process.env.TASKITTY_API_EXE || null },
    { label: `saved path ${API_EXE_FILE}`, value: readSavedApiExe() },
  ];
  for (const dir of registryInstallDirs()) sources.push({ label: `installer registry (${dir})`, value: dir, folderOnly: true });
  const up = path.dirname(SCRIPT_DIR);
  sources.push({ label: `beside this script (${SCRIPT_DIR})`, value: SCRIPT_DIR, folderOnly: true });
  if (up !== SCRIPT_DIR) sources.push({ label: `one folder up (${up})`, value: up, folderOnly: true });
  return sources;
}

function candidateFor(source) {
  const p = source.folderOnly ? path.join(source.value, EXE_NAME) : normalizedExePath(source.value);
  if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  return null;
}

function configuredApiExe() {
  for (const source of apiExeSources()) {
    const candidate = candidateFor(source);
    if (candidate) return { path: candidate, source: source.label };
  }
  return null;
}

function requireApiExe() {
  const found = configuredApiExe();
  if (found) return found;
  fail(`could not locate ${EXE_NAME}. Install Taskitty, set TASKITTY_API_EXE to its full path or folder, or run \`taskitty configure <path-to-${EXE_NAME}>\` once. Run \`taskitty which\` to see what was tried.`);
}

function cmdConfigure(args) {
  if (!args[0]) fail(`Usage: taskitty configure <path-to-${EXE_NAME}>`);
  const exe = normalizedExePath(args[0]);
  if (!exe || !fs.existsSync(exe) || !fs.statSync(exe).isFile()) {
    fail(`not a file: ${args[0]}`);
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(API_EXE_FILE, `${exe}\n`, { mode: 0o600 });
  console.log(`Taskitty API executable configured: ${exe}`);
}

function cmdConfigureUrl(args) {
  if (!args[0]) fail('Usage: taskitty configure-url <http://hostname:port>');
  const endpoint = normalizedApiUrl(args[0]);
  if (!endpoint) fail(`not a valid HTTP API endpoint: ${args[0]}`);
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(API_URL_FILE, `${endpoint}\n`, { mode: 0o600 });
  console.log(`Taskitty API endpoint configured: ${endpoint}`);
}

function cmdWhich() {
  console.log(`Looking for ${EXE_NAME}:`);
  let resolved = null;
  for (const source of apiExeSources()) {
    if (!source.value) {
      console.log(`  [not set]   ${source.label}`);
      continue;
    }
    const candidate = candidateFor(source);
    if (candidate && !resolved) {
      resolved = { path: candidate, source: source.label };
      console.log(`  [resolved]  ${source.label} -> ${candidate}`);
      break;
    }
    console.log(`  [missing]   ${source.label}: ${source.value}`);
  }
  if (resolved) console.log(`Resolved via ${resolved.source}: ${resolved.path}`);
  else console.log(`Not found. Install Taskitty or run: taskitty configure <path-to-${EXE_NAME}>`);
}

function portOpen() {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (value) => { if (!settled) { settled = true; try { socket.destroy(); } catch {} resolve(value); } };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    const timer = setTimeout(() => finish(false), 1000);
    if (timer.unref) timer.unref();
  });
}

function pidFromPortFile() {
  try { return Number(fs.readFileSync(PID_FILE, 'utf8').trim()); } catch { return null; }
}

function pidListeningOnPort() {
  // Fallback for servers started outside this launcher (e.g. by hand or the desktop app).
  try {
    if (IS_WIN) {
      const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
      for (const line of out.split(/\r?\n/)) {
        if (/LISTENING/i.test(line)) {
          const parts = line.trim().split(/\s+/);
          return Number(parts[parts.length - 1]) || null;
        }
      }
    } else {
      const out = execSync(`lsof -ti tcp:${PORT} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
      if (out) return Number(out.split('\n')[0]);
    }
  } catch { /* no listener or tool missing */ }
  return null;
}

function killTree(pid) {
  if (IS_WIN) {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
  }
}

function waitForPort(open, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    (async () => {
      for (;;) {
        if ((await portOpen()) === open) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
  });
}

async function cmdStart() {
  if (!LOCAL_ENDPOINT) {
    fail(`start only launches a local sidecar; ${API_URL} is a remote endpoint. Start that API on its host, then use task commands normally.`);
  }
  if (await portOpen()) {
    console.log(`Taskitty API is already running at ${API_URL}`);
    return;
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  const found = requireApiExe();
  const args = [];
  if (PORT !== 38473) args.push('--port', String(PORT));
  console.log(`Starting Taskitty API: ${found.path} [${found.source}]`);
  const logFd = fs.openSync(LOG_FILE, 'a');
  try { fs.appendFileSync(LOG_FILE, `\n--- started at ${new Date().toISOString()} ---\n`); } catch {}
  const child = spawn(found.path, args, { detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd] });
  fs.closeSync(logFd); // the child holds its own inherited handles.
  try { fs.writeFileSync(PID_FILE, String(child.pid)); } catch {}
  child.unref();

  const startedAt = Date.now();
  let announced = startedAt;
  while (!(await portOpen())) {
    if (Date.now() - startedAt > 600_000) fail(`server did not come up within 10 minutes. Log: ${LOG_FILE}`);
    if (Date.now() - announced >= 30_000) { console.log('still starting...'); announced = Date.now(); }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const pid = pidFromPortFile() || child.pid;
  console.log(`Taskitty API is running at ${API_URL}`);
  console.log(`PID: ${pid}   log: ${LOG_FILE}`);
}

async function cmdStop() {
  if (!LOCAL_ENDPOINT) fail(`stop only controls a local sidecar; ${API_URL} is remote. Stop it on its host.`);
  if (!(await portOpen())) {
    try { fs.unlinkSync(PID_FILE); } catch {}
    console.log('Taskitty API is not running.');
    return;
  }
  const pid = pidFromPortFile() || pidListeningOnPort();
  if (!pid) fail(`API is listening on ${PORT} but no PID was found. Stop it manually.`);
  killTree(pid);
  if (!(await waitForPort(false, 15_000))) {
    killTree(pid); // escalate once (Unix SIGTERM may be swallowed).
    if (!(await waitForPort(false, 10_000))) fail(`could not stop the API on ${HOST}:${PORT}. PID was ${pid}.`);
  }
  try { fs.unlinkSync(PID_FILE); } catch {}
  console.log('Taskitty API stopped.');
}

async function cmdStatus() {
  if (await portOpen()) {
    const pid = LOCAL_ENDPOINT ? pidFromPortFile() : null;
    console.log(`running at ${API_URL}${pid ? ` (PID ${pid})` : ''}`);
    return;
  }
  console.log('not running');
  process.exitCode = 1;
}

function cmdToken() {
  // Token is endpoint/client state. Do not execute the sidecar here: only the
  // explicit `start` action may launch taskitty-api.
  if (fs.existsSync(TOKEN_FILE)) {
    process.stdout.write(fs.readFileSync(TOKEN_FILE, 'utf8').trim() + '\n');
    return;
  }
  fail(`no token file at ${TOKEN_FILE}; start the API once or copy its token from Taskitty Settings.`);
}

// ---------------------------------------------------------------------------
// Task CRUD - thin HTTP client for the local API, which makes this script the
// cross-project way to manage tasks. taskitty.ps1 (same folder) stays available
// as a Node-free PowerShell equivalent on Windows; both read the same token
// file (<dataDir>/api-token) shared with the desktop settings overlay.
// ---------------------------------------------------------------------------

function readToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    fail(`no token file at ${TOKEN_FILE} - run the \`token\` action (or open desktop settings) first.`);
  }
}

let cliWorkspace = null; // set from --workspace at dispatch time

function extractWorkspaceFlag(argv) {
  // Accepts `--workspace <path>` or `--workspace=<path>` anywhere in argv and
  // strips it so command-specific argument validation sees only real args.
  const args = [];
  let workspace = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--workspace') {
      if (!argv[i + 1]) fail('missing path after --workspace');
      workspace = argv[++i];
    } else if (argv[i].startsWith('--workspace=')) {
      const value = argv[i].slice('--workspace='.length);
      if (!value) fail('missing path for --workspace=');
      workspace = value;
    } else {
      args.push(argv[i]);
    }
  }
  return { args, workspace };
}

function resolveWorkspace() {
  // Precedence: explicit --workspace flag, then a project-local taskitty.json in
  // the cwd (so each repo declares which Taskitty DB documents its work), then
  // null - meaning "let the API use its active registered workspace".
  if (cliWorkspace) return cliWorkspace;
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'taskitty.json'), 'utf8'));
    if (doc && typeof doc.databasePath === 'string' && doc.databasePath.trim()) return doc.databasePath.trim();
  } catch {}
  return null;
}

function configBoardId() {
  // The project config's default documentation board, used as the <board_id> fallback by
  // board/tags/create-tag. Only valid when that same ./taskitty.json selected the workspace:
  // board ids are per-workspace, so an explicit --workspace (or the API active workspace)
  // must never inherit another project's board id.
  if (cliWorkspace) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'taskitty.json'), 'utf8'));
    const id = Number(doc && doc.boardId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}

function configAuthorId() {
  // The project config's default author (member id), used to attribute tasks and comments
  // created by add/comment. Same per-workspace rule as boardId: member ids are local to the
  // workspace database, so an explicit --workspace must never inherit another project's author.
  if (cliWorkspace) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'taskitty.json'), 'utf8'));
    const id = Number(doc && doc.authorId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}

function resolveBoardId(explicit, usage) {
  if (explicit != null && String(explicit).trim() !== '') {
    const id = Number(String(explicit).trim());
    if (!Number.isInteger(id)) fail(`${usage}: <board_id> must be a whole number`);
    return id;
  }
  const fallback = configBoardId();
  if (!fallback) {
    const why = cliWorkspace
      ? 'the --workspace override does not inherit a board id (board ids are per-workspace)'
      : './taskitty.json has no "boardId" to default to';
    fail(`Usage: taskitty ${usage} - no board_id given and ${why}`);
  }
  console.error(`taskitty: using boardId ${fallback} from taskitty.json (pass a number to override)`);
  return fallback;
}

async function api(method, p, body = null) {
  if (typeof fetch !== 'function') fail('task actions require Node 18+ for global fetch; lifecycle actions still work.');
  // Task actions are deliberately endpoint-only. This makes a client usable
  // against an already-running API by IP address/hostname and keeps executable
  // resolution exclusively inside `start`.
  if (!(await portOpen())) fail(`API not reachable at ${API_URL}; start it on that endpoint before running task commands.`);
  const workspace = resolveWorkspace();
  if (body && workspace) body = Object.assign({}, body, { workspace });

  let res;
  try {
    res = await fetch(`${API_URL}${p}`, {
      method,
      headers: Object.assign({ Authorization: `Bearer ${readToken()}` }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body === null ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    fail(`API not reachable at ${API_URL} (${e.message}) - start it on that endpoint first.`);
  }
  const text = await res.text();
  if (!res.ok) fail(`${method.toUpperCase()} ${p} failed: HTTP ${res.status} ${text}`.trim());
  try { return JSON.parse(text); } catch { return text; }
}

async function cmdHealth() {
  const r = await api('GET', '/v1/health');
  console.log(`Health OK: ${r.ok} service=${r.service}`);
}

async function cmdBoards() {
  const boards = (await api('POST', '/v1/boards', {})) || [];
  for (const b of boards) console.log(`${b.id}  ${b.name}`);
}

async function cmdCreateBoard(args) {
  if (!args[0]) fail('Usage: taskitty create-board "Board name" [description]');
  const r = await api('POST', '/v1/boards/create', {
    name: payloadArg(args[0]),
    description: args[1] ? payloadArg(args[1]) : undefined,
  });
  console.log(`Created board id=${r.id}`);
}

async function cmdCreateList(args) {
  if (!args[0] || !args[1]) fail('Usage: taskitty create-list <board_id> "List name"');
  const r = await api('POST', '/v1/lists', { board_id: Number(args[0]), name: payloadArg(args[1]) });
  console.log(`Created list id=${r.id}`);
}

async function cmdDeleteList(args) {
  if (!args[0]) fail('Usage: taskitty delete-list <list_id>');
  const r = await api('DELETE', `/v1/lists/${args[0]}`, {});
  console.log(`Deleted list id=${r.id}`);
}

async function cmdProjectConfig(args) {
  // Writes taskitty.json into an existing project directory through the API. The workspace is
  // selected exactly like for other actions (--workspace flag, then ./taskitty.json in the cwd,
  // else the API's active workspace); replacing an existing config needs an explicit opt-in here
  // and in the request body so a stray call never clobbers a project's declared database.
  const usage = 'Usage: taskitty project-config [directory] [--replace] [--board-id <id>] [--board-name "name"] [--author-id <id>] [--author-name "name"]';
  let directory, replace = false, boardId, boardName, authorId, authorName;
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a === '--replace') replace = true;
    else if (a === '--board-id') {
      const id = Number(String(args[++i]).trim());
      if (!Number.isInteger(id) || id <= 0) fail(`${usage}: --board-id must be a positive whole number`);
      boardId = id;
    }
    else if (a === '--board-name') {
      if (args[i + 1] === undefined) fail(usage);
      boardName = String(args[++i]);
    }
    else if (a === '--author-id') {
      const id = Number(String(args[++i]).trim());
      if (!Number.isInteger(id) || id <= 0) fail(`${usage}: --author-id must be a positive whole number`);
      authorId = id;
    }
    else if (a === '--author-name') {
      if (args[i + 1] === undefined) fail(usage);
      authorName = String(args[++i]);
    }
    else if (a.startsWith('--')) fail(`${usage}\nUnknown flag: ${a}`);
    else if (directory !== undefined) fail(`${usage}: only one directory argument`);
    else directory = a;
  }
  const body = { directory: directory === undefined ? '.' : directory };
  if (replace) body.replace = true;
  if (boardId !== undefined) body.board_id = boardId;
  if (boardName !== undefined) body.board_name = boardName;
  if (authorId !== undefined) body.author_id = authorId;
  if (authorName !== undefined) body.author_name = authorName;
  const r = await api('POST', '/v1/project-config', body);
  console.log(`Project config saved: ${r.path}`);
}

async function cmdDeleteBoard(args) {
  if (!args[0]) fail('Usage: taskitty delete-board <board_id>');
  const r = await api('DELETE', `/v1/boards/${args[0]}`, {});
  console.log(`Deleted board id=${r.id}`);
}

async function cmdBoard(args) {
  const boardId = resolveBoardId(args[0], 'board ["<board_id>"]');
  const r = await api('POST', `/v1/boards/${boardId}`, {});
  console.log(`Board: ${r.name} (id=${r.id})`);
  for (const l of r.lists || []) console.log(`  List: ${l.id}  ${l.name}`);
}

function payloadArg(value) {
  // `@path` reads a free-text payload from disk so embedded quotes/newlines survive
  // shell layers (npm run -> cmd.exe / Windows PowerShell native-arg mangling).
  if (!value.startsWith('@')) return value;
  const file = path.resolve(process.cwd(), value.slice(1));
  try { return fs.readFileSync(file, 'utf8').replace(/\r?\n$/, ''); } catch (e) { fail(`could not read payload from ${file}: ${e.message}`); }
}

async function cmdAdd(args) {
  if (!args[0] || !args[1]) fail('Usage: taskitty add <list_id> "Task name"');
  const name = payloadArg(args[1]);
  const body = { list_id: Number(args[0]), name };
  const authorId = configAuthorId();
  if (authorId !== null) body.author_id = authorId;
  const r = await api('POST', '/v1/tasks', body);
  console.log(`Created task id=${r.id}${authorId !== null ? ` (as member ${authorId})` : ''}`);
}

const FLAG_PATCHES = {
  done: ['done', true], undone: ['done', false],
  doing: ['doing', true], off_doing: ['doing', false],
  on_hold: ['on_hold', true], off_on_hold: ['on_hold', false],
};
const FLAG_LABELS = {
  done: 'done', undone: 'not done', doing: 'doing',
  off_doing: 'not doing', on_hold: 'on hold', off_on_hold: 'not on hold',
};

async function cmdFlag(action, args) {
  if (!args[0]) fail(`Usage: taskitty ${action} <task_id>`);
  const [field, value] = FLAG_PATCHES[action];
  const r = await api('PATCH', `/v1/tasks/${args[0]}`, { [field]: value });
  console.log(`Marked task ${r.id ?? args[0]} as ${FLAG_LABELS[action]}`);
}

async function cmdRename(args) {
  if (!args[0] || !args[1]) fail('Usage: taskitty rename <task_id> "New name"');
  const name = payloadArg(args[1]);
  const r = await api('PATCH', `/v1/tasks/${args[0]}`, { name });
  console.log(`Renamed task ${r.id ?? args[0]} to '${name.slice(0, 80)}'`);
}

async function cmdDescription(args) {
  if (!args[0] || !args[1]) fail('Usage: taskitty description <task_id> "Markdown"');
  const description = payloadArg(args[1]);
  const r = await api('PATCH', `/v1/tasks/${args[0]}`, { description });
  console.log(`Set description for task ${r.id ?? args[0]}`);
}

async function setTaskDate(kind, action, args) {
  if (!args[0] || !args[1]) fail(`Usage: taskitty ${action} <task_id> "<ISO-8601 datetime>" | clear`);
  const value = String(args[1]).toLowerCase() === 'clear' ? '' : payloadArg(args[1]);
  const r = await api('PATCH', `/v1/tasks/${args[0]}`, { [`${kind}_datetime`]: value });
  console.log(value ? `Set ${kind} date for task ${r.id ?? args[0]} to ${value}` : `Cleared ${kind} date for task ${r.id ?? args[0]}`);
}

async function cmdStartDate(args) { await setTaskDate('start', 'start-date', args); }
async function cmdDueDate(args) { await setTaskDate('due', 'due-date', args); }

async function cmdListTasks(args) {
  if (!args[0]) fail('Usage: taskitty list-tasks <list_id>');
  const r = await api('POST', `/v1/lists/${args[0]}/tasks`, {});
  const tasks = r.tasks || [];
  console.log(`List ${r.id}: ${r.name} (${tasks.length}/${r.task_total ?? tasks.length} tasks)`);
  for (const t of tasks) {
    const flags = [t.done && 'done', t.doing && 'doing', t.on_hold && 'on hold'].filter(Boolean).join(', ');
    console.log(`  Task ${t.id}: ${t.name}${flags ? ` — ${flags}` : ''}`);
    if (t.start_datetime) console.log(`    start: ${t.start_datetime}`);
    if (t.due_datetime) console.log(`    due:   ${t.due_datetime}`);
  }
}

async function cmdDelete(args) {
  if (!args[0]) fail('Usage: taskitty delete <task_id>');
  await api('DELETE', `/v1/tasks/${args[0]}`, {});
  console.log(`Deleted task ${args[0]}`);
}

async function cmdExportMarkdown(args) {
  const usage = 'Usage: taskitty export-markdown ["<board_id>"] [--scope board|list|task] [--format lists|single] [--list-id N] [--task-id N] [--out file.md|dir/]\n' +
    '            filters (same semantics as the GUI): --tags id,id --members id,id --milestones id,id\n' +
    '            --versions v1,v2 --due any|overdue|today --hide-hidden\n' +
    '            board scope defaults to --format lists (one list-<id>.md per visible list); use --out dir/ to write them, or --format single for one combined file.';
  let explicitBoard = null;
  const body = { scope: 'board', format: 'lists' };
  const filter = {};
  let outPath = null;
  const ids = (v) => String(v).split(',').map((s) => Number(s.trim())).filter(Number.isInteger);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^\d+$/.test(a.trim())) {
      if (explicitBoard !== null) fail(`${usage}\nonly one board id`);
      explicitBoard = a.trim();
    } else if (a === '--scope') {
      const v = String(args[++i] ?? '');
      if (!['board', 'list', 'task'].includes(v)) fail(`${usage}: --scope must be board, list or task`);
      body.scope = v;
    } else if (a === '--format') {
      const v = String(args[++i] ?? '');
      if (!['lists', 'single'].includes(v)) fail(`${usage}: --format must be lists or single`);
      body.format = v;
    } else if (a === '--list-id' && args[i + 1] !== undefined) body.list_id = Number(args[++i]);
    else if (a === '--task-id' && args[i + 1] !== undefined) body.task_id = Number(args[++i]);
    else if (a === '--tags' && args[i + 1] !== undefined) filter.tags = ids(args[++i]);
    else if (a === '--members' && args[i + 1] !== undefined) filter.members = ids(args[++i]);
    else if (a === '--milestones' && args[i + 1] !== undefined) filter.milestones = ids(args[++i]);
    else if (a === '--versions' && args[i + 1] !== undefined) filter.versions = String(args[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--due') {
      const v = String(args[++i] ?? '');
      if (!['any', 'overdue', 'today'].includes(v)) fail(`${usage}: --due must be any, overdue or today`);
      filter.due = v;
    } else if (a === '--hide-hidden') filter.hide_hidden = true;
    else if (a === '--out' && args[i + 1] !== undefined) outPath = path.resolve(process.cwd(), args[++i]);
    else fail(`${usage}\nUnknown argument: ${a}`);
  }
  const boardId = resolveBoardId(explicitBoard, 'export-markdown ["<board_id>"]');
  body.board_id = boardId;
  if (Object.keys(filter).length > 0) body.filter = filter;
  const r = await api('POST', '/v1/export/markdown', body);
  // The API returns { files: [{ filename, markdown }] } — one entry per file.
  const files = Array.isArray(r.files) ? r.files : (r.markdown != null ? [{ filename: 'export.md', markdown: r.markdown }] : []);
  if (!files.length) fail(`export returned no files for board ${boardId}`);
  const normalize = (text) => (typeof text === 'string' && text.endsWith('\n') ? text : `${text}\n`);

  // Multi-file (per-list) export: write each file into an output directory.
  if (files.length > 1) {
    if (!outPath) fail(`${usage}\nmulti-file export needs --out <dir> to write the list files`);
    fs.mkdirSync(outPath, { recursive: true });
    for (const f of files) {
      const target = path.join(outPath, f.filename || 'export.md');
      fs.writeFileSync(target, normalize(f.markdown));
      console.log(`Wrote ${path.basename(target)} (${f.markdown.length} chars)`);
    }
    console.log(`${files.length} list file(s) written to ${outPath}`);
    return;
  }

  // Single-file export (board single, or list/task scope).
  const text = normalize(files[0].markdown);
  if (outPath) { fs.writeFileSync(outPath, text); console.log(`Wrote ${path.basename(outPath)} (${text.length} chars, scope=${body.scope}, format=${body.format})`); }
  else process.stdout.write(text);
}

function excerpt(value, max) {
  const s = String(value ?? '').trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

async function cmdTask(args) {
  if (!args[0]) fail('Usage: taskitty task <task_id>');
  const r = await api('POST', `/v1/tasks/${args[0]}`, {});
  const t = r.task || {};
  const flags = [t.done && 'done', t.doing && 'doing', t.on_hold && 'on hold'].filter(Boolean).join(', ');
  console.log(`Task ${r.id}: ${t.name} (list "${r.list_name}", board ${r.board_id})${flags ? ` — ${flags}` : ''}`);
  if (t.description) console.log(`  description: ${excerpt(t.description, 200)}`);
  if (t.start_datetime) console.log(`  start: ${t.start_datetime}`);
  if (t.due_datetime) console.log(`  due:   ${t.due_datetime}`);
  const tagNames = (t.tags || []).map((x) => x.name).join(', ');
  if (tagNames) console.log(`  tags: ${tagNames}`);
  const memberNames = (t.members || []).map((x) => x.name).join(', ');
  if (memberNames) console.log(`  members: ${memberNames}`);
  for (const c of t.comments || []) {
    const author = c.author_name ? ` by ${c.author_name}` : '';
    console.log(`  Comment ${c.id}[${c.added_datetime}]${author}${c.edited_datetime && c.edited_datetime !== c.added_datetime ? ' (edited)' : ''}`);
    for (const line of excerpt(c.message, 500).split('\n')) console.log(`    ${line}`);
  }
}

async function cmdComment(args) {
  if (!args[0] || !args[1]) fail('Usage: taskitty comment <task_id> "text" (or @file)');
  const message = payloadArg(args[1]);
  const body = { message };
  const authorId = configAuthorId();
  if (authorId !== null) body.author_id = authorId;
  const r = await api('POST', `/v1/tasks/${args[0]}/comments`, body);
  console.log(`Added comment id=${r.id} on task ${args[0]}${authorId !== null ? ` (as member ${authorId})` : ''}`);
}

async function cmdReflections(args) {
  // Structured finishing comment - the desktop Reflections panel through the API. Filled
  // sections are composed in fixed order into "Title: text" lines on one card comment;
  // --blog / --follow-up mirror the panel's side effects (draft note, follow-up card).
  const usage = 'Usage: taskitty reflections <task_id> [--cause "text"] [--solution "text"] [--troubles "text"] [--findings "text"] [--todos "text"] [--other "text"] [--blog] [--follow-up]';
  if (!args[0]) fail(usage);
  const sections = { cause: null, solution: null, troubles: null, findings: null, todos: null, other: null };
  let blog = false;
  let followUp = false;
  for (let i = 1; i < args.length; i++) {
    const a = String(args[i]);
    if (a === '--blog') blog = true;
    else if (a === '--follow-up') followUp = true;
    else if (Object.prototype.hasOwnProperty.call(sections, a.slice(2))) {
      if (args[i + 1] === undefined) fail(`${usage}\nMissing text after ${a} (inline or @file)`);
      sections[a.slice(2)] = payloadArg(args[++i]);
    } else fail(`${usage}\nUnknown flag: ${a}`);
  }
  const body = {};
  for (const [key, value] of Object.entries(sections)) if (value !== null) body[key] = value;
  if (blog) body.create_blog_post = true;
  if (followUp) body.create_follow_up_task = true;
  const authorId = configAuthorId();
  if (authorId !== null) body.author_id = authorId;
  const r = await api('POST', `/v1/tasks/${args[0]}/reflections`, body);
  console.log(`Saved finishing comment id=${r.comment_id} on task ${args[0]}${r.follow_up_task_id ? ` (follow-up task ${r.follow_up_task_id})` : ''}${r.blog_note_id ? ` (blog draft note ${r.blog_note_id})` : ''}`);
}

async function cmdEditComment(args) {
  if (!args[0] || !args[1]) fail('Usage: taskitty edit_comment <comment_id> "new text" (or @file)');
  const message = payloadArg(args[1]);
  await api('PATCH', `/v1/comments/${args[0]}`, { message });
  console.log(`Edited comment ${args[0]}`);
}

async function cmdDeleteComment(args) {
  if (!args[0]) fail('Usage: taskitty delete_comment <comment_id>');
  await api('DELETE', `/v1/comments/${args[0]}`, {});
  console.log(`Deleted comment ${args[0]}`);
}
async function cmdAttach(args) {
  if (!args[0] || !args[1]) fail('Usage: taskitty attach <task_id> <file>');
  const file = path.resolve(process.cwd(), args[1]);
  let data;
  try { data = fs.readFileSync(file); } catch (e) { fail(`could not read attachment ${file}: ${e.message}`); }
  const r = await api('POST', `/v1/tasks/${args[0]}/attachments`, { name: path.basename(file), data_base64: data.toString('base64') });
  console.log(`Attached ${path.basename(file)} as cover attachment id=${r.attachment_id} on task ${args[0]}`);
}
async function cmdCommentAttach(args) {
  if (!args[0] || !args[1]) fail('Usage: taskitty comment-attach <comment_id> <file>');
  const file = path.resolve(process.cwd(), args[1]);
  let data;
  try { data = fs.readFileSync(file); } catch (e) { fail(`could not read attachment ${file}: ${e.message}`); }
  const r = await api('POST', `/v1/comments/${args[0]}/attachments`, { name: path.basename(file), data_base64: data.toString('base64') });
  console.log(`Attached ${path.basename(file)} as attachment id=${r.attachment_id} on comment ${args[0]}`);
}
async function cmdTags(args) { const boardId = resolveBoardId(args[0], 'tags ["<board_id>"]'); for (const tag of await api('POST', `/v1/boards/${boardId}/tags`, {})) console.log(`${tag.id}  ${tag.name}`); }
async function cmdCreateTag(args) { let explicit = null, offset = 0;
  if (args[0] !== undefined && /^\d+$/.test(String(args[0]).trim())) { explicit = args[0]; offset = 1; } // numeric first arg = board id, otherwise name-first form
  const name = args[offset];
  if (!name) fail('Usage: taskitty create-tag ["<board_id>"] "name" [color] - the board defaults to ./taskitty.json "boardId"');
  const boardId = resolveBoardId(explicit, 'create-tag ["<board_id>"] "name" [color]');
  const r = await api('POST', '/v1/tags', { board_id:boardId, name:payloadArg(name), color:args[offset + 1] });
  console.log(`Created tag id=${r.id} on board ${boardId}`); }
async function cmdTagTask(args) { if (!args[0] || !args[1]) fail('Usage: taskitty tag-task <task_id> <tag_id>'); await api('POST', `/v1/tasks/${args[0]}/tags`, {tag_id:Number(args[1])}); console.log(`Tagged task ${args[0]} with tag ${args[1]}`); }
async function cmdUntagTask(args) { if (!args[0] || !args[1]) fail('Usage: taskitty untag-task <task_id> <tag_id>'); await api('DELETE', `/v1/tasks/${args[0]}/tags/${args[1]}`, {}); console.log(`Removed tag ${args[1]} from task ${args[0]}`); }
async function cmdMembers() { for (const m of await api('POST', '/v1/members', {})) console.log(`${m.id}  ${m.name}${m.description ? ` - ${m.description}` : ''}`); }
async function cmdCreateMember(args) { const name = args[0]; if (!name) fail('Usage: taskitty create-member "name" [description]'); const r = await api('POST', '/v1/members/create', { name: payloadArg(name), description: args[1] ? payloadArg(args[1]) : undefined }); console.log(`Created member id=${r.id}`); }
async function cmdMemberTask(args) { if (!args[0] || !args[1]) fail('Usage: taskitty member-task <task_id> <member_id>'); await api('POST', `/v1/tasks/${args[0]}/members`, { member_id: Number(args[1]) }); console.log(`Assigned member ${args[1]} to task ${args[0]}`); }
async function cmdUnassignMember(args) { if (!args[0] || !args[1]) fail('Usage: taskitty unassign-member <task_id> <member_id>'); await api('DELETE', `/v1/tasks/${args[0]}/members/${args[1]}`, {}); console.log(`Unassigned member ${args[1]} from task ${args[0]}`); }
async function cmdBoardMember(args) { if (!args[0] || !args[1]) fail('Usage: taskitty board-member <board_id> <member_id>'); await api('POST', `/v1/boards/${args[0]}/members`, { member_id: Number(args[1]) }); console.log(`Assigned member ${args[1]} to board ${args[0]}`); }
async function cmdUnassignBoardMember(args) { if (!args[0] || !args[1]) fail('Usage: taskitty unassign-board-member <board_id> <member_id>'); await api('DELETE', `/v1/boards/${args[0]}/members/${args[1]}`, {}); console.log(`Unassigned member ${args[1]} from board ${args[0]}`); }

const action = process.argv[2] || 'status';
const { args: rest, workspace } = extractWorkspaceFlag(process.argv.slice(3));
cliWorkspace = workspace;
const run = (fn) => fn().catch((e) => fail(e.message));

switch (action) {
  case 'configure': cmdConfigure(rest); break;
  case 'configure-url': cmdConfigureUrl(rest); break;
  case 'which': cmdWhich(); break;
  case 'start': run(cmdStart); break;
  case 'stop': run(cmdStop); break;
  case 'status': run(cmdStatus); break;
  case 'health': run(cmdHealth); break;
  case 'token': cmdToken(); break;
  case 'boards': run(cmdBoards); break;
  case 'create-board': run(() => cmdCreateBoard(rest)); break;
  case 'create-list': run(() => cmdCreateList(rest)); break;
  case 'delete-list': run(() => cmdDeleteList(rest)); break;
  case 'project-config': run(() => cmdProjectConfig(rest)); break;
  case 'delete-board': run(() => cmdDeleteBoard(rest)); break;
  case 'board': run(() => cmdBoard(rest)); break;
  case 'add': run(() => cmdAdd(rest)); break;
  case 'done': case 'undone': case 'doing': case 'off_doing': case 'on_hold': case 'off_on_hold':
    run(() => cmdFlag(action, rest)); break;
  case 'rename': run(() => cmdRename(rest)); break;
  case 'description': run(() => cmdDescription(rest)); break;
  case 'start-date': run(() => cmdStartDate(rest)); break;
  case 'due-date': run(() => cmdDueDate(rest)); break;
  case 'list-tasks': run(() => cmdListTasks(rest)); break;
  case 'task': run(() => cmdTask(rest)); break;
  case 'comment': run(() => cmdComment(rest)); break;
  case 'reflections': run(() => cmdReflections(rest)); break;
  case 'edit_comment': run(() => cmdEditComment(rest)); break;
  case 'delete_comment': run(() => cmdDeleteComment(rest)); break;
  case 'attach': run(() => cmdAttach(rest)); break;
  case 'comment-attach': run(() => cmdCommentAttach(rest)); break;
  case 'tags': run(() => cmdTags(rest)); break;
  case 'create-tag': run(() => cmdCreateTag(rest)); break;
  case 'tag-task': run(() => cmdTagTask(rest)); break;
  case 'untag-task': run(() => cmdUntagTask(rest)); break;
  case 'members': run(cmdMembers); break;
  case 'create-member': run(() => cmdCreateMember(rest)); break;
  case 'member-task': run(() => cmdMemberTask(rest)); break;
  case 'unassign-member': run(() => cmdUnassignMember(rest)); break;
  case 'board-member': run(() => cmdBoardMember(rest)); break;
  case 'unassign-board-member': run(() => cmdUnassignBoardMember(rest)); break;
  case 'delete': run(() => cmdDelete(rest)); break;
  case 'export-markdown': run(() => cmdExportMarkdown(rest)); break;
  default:
    console.log(`Taskitty API CLI - endpoint ${API_URL} (override with TASKITTY_API_URL)`);
    console.log('Lifecycle : configure <taskitty-api path> | configure-url <http://host:port> | which | start | stop | status | health | token');
    console.log('Tasks     : boards | create-board "name" [description] | create-list <board_id> "name" | delete-list <list_id> | delete-board <board_id>');
    console.log('Project   : project-config [directory] [--replace] [--board-id N --board-name "name"] [--author-id N --author-name "name"] writes taskitty.json via the API');
    console.log('            board ["<board_id>"] | tags ["<board_id>"] | create-tag ["<board_id>"] "name" [color]');
    console.log('            tag-task <task_id> <tag_id> | untag-task <task_id> <tag_id>');
    console.log('Members   : members | create-member "name" [description] | member-task <task_id> <member_id>');
    console.log('            unassign-member <task_id> <member_id>');
    console.log('Board mem : board-member <board_id> <member_id> | unassign-board-member <board_id> <member_id>');
    console.log('Cards     : add <list_id> "name" | task <task_id> | list-tasks <list_id>');
    console.log('            done|undone|doing|off_doing|on_hold|off_on_hold <task_id>');
    console.log('            rename|description accept inline text or @file for quotes/newlines | delete <task_id>');
    console.log('Dates     : start-date|due-date <task_id> "<ISO-8601 datetime>" | clear  (e.g. "2026-09-07T00:00:00.000Z")');
    console.log('Comments  : comment <task_id> "text" | edit_comment <comment_id> "new text" (both accept @file)');
    console.log('            delete_comment <comment_id> - ids come from `task` or the board graph');
    console.log('Finishing : reflections <task_id> [--cause|--solution|--troubles|--findings|--todos|--other "text"|@file] [--blog] [--follow-up]');
    console.log('            structured finishing comment (Reflections sections); --blog saves a draft note, --follow-up creates the follow-up card');
    console.log('Files     : attach <task_id> <file> sets the card cover | comment-attach <comment_id> <file>');
    console.log('Export    : export-markdown ["<board_id>"] [--scope board|list|task] [--format lists|single] [--list-id N|--task-id N] [--out file.md|dir/]');
    console.log('            filters like the GUI: --tags id,id --members id,id --milestones id,id --versions v1,v2 --due any|overdue|today --hide-hidden');
    console.log('Workspace : --workspace <path> on any task action; otherwise ./taskitty.json "databasePath" (cwd); else the API active workspace');
    console.log('Board id  : omitted board ids default to ./taskitty.json "boardId" when that config selected the workspace; an explicit number always wins');
    console.log('Author    : add/comment attribute tasks/comments to ./taskitty.json "authorId" when that config selected the workspace (per-workspace member id)');
    process.exit(action === 'help' || action === '--help' ? 0 : 1);
}
