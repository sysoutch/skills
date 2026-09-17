---
name: uragenow-api
description: Connect an application or LLM to a running URageNow Studio release API for media generation, tool-resource handoff, and Chat Studio workflows. Use when URageNow is available as a local or reachable HTTP server; do not use for generic HTTP APIs.
---

# URageNow Studio API Client

Use this skill from any client project that consumes a running URageNow Studio release. The API server is intentionally external to the client project: it may already be running on the same computer or another reachable machine. Do not inspect the client workspace for URageNow source files, require a source checkout, or infer that the server is absent because this project does not contain it.

## Required first action

Loading this skill only makes these instructions available. It does **not** call URageNow, return server data, or reveal a failed API request. Never load the skill again as a substitute for an HTTP request and never describe its instructions as an API result.

From the consuming project root, the very next action must be one of the exact helper commands below. Do this before searching, listing, or reading any workspace files, `.env` files, `config.json`, package manifests, source checkout, or agent configuration. The helper uses `URAGE_API_BASE_URL` when it is configured; otherwise it uses the local default `http://127.0.0.1:4782`.

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action health
```

```powershell
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action health
```

After the health command succeeds, run the matching `manifest` command once, retain those two command results as the active server state, and directly run the appropriate `post-json`, `download`, `jobs`, or `artifact` command. Do not reload this skill between these calls. If a helper command fails, report that command's actual error rather than inspecting the client workspace to guess whether the server exists.
## Execution contract

A thought, explanation, loaded-skill panel, command template, or statement such as “now let me download it” is not progress. For an API operation requested by the user, run the corresponding helper command in the same workflow turn; do not pause to reload this skill, restate the plan, or search the workspace.

For a plain image request, use this fixed sequence: `health` (when not already confirmed) → `manifest` (when not already obtained) → one image `post-json` call → `download` using the returned image `id` and `imageFileName` to a new user-reachable output path → report that saved path. Keep the successful artifact record in context. Do not add a 3D-model, audio, video, or other generation call unless the user explicitly asks for it.

When the helper prints JSON, use that JSON as the result. Do not reload the skill to interpret it, create a summary file in place of the requested media, or replace the next helper command with commentary. If the helper fails, surface its actual error and stop rather than guessing from workspace files.
## Connect

- Obtain the configured API base URL and any required authorization from the user or the project's existing configuration. If a base URL is not supplied, use the local default `http://127.0.0.1:4782`; do not guess another port or scan ports.
- Treat a base URL supplied by the user, or their statement that URageNow is already running, as authority to contact that external server. Immediately run the supplied helper's `health` action against that URL. Never decide the server is unavailable from the client project's files. Only if the direct health request fails should you report the actual failure and ask for the configured URL or port.
- `localhost` or `127.0.0.1` works only when the caller and URageNow run on the same machine. A different device needs a reachable host, firewall rules, and any required CORS configuration.
- Loading this skill provides instructions; it does not itself perform network requests. From the consuming project root, the helpers are exactly `.agents/skills/URageNow/scripts/uragenow-api.mjs` and `.agents/skills/URageNow/scripts/uragenow-api.ps1`. The `scripts/...` links below are relative to this skill folder, not the consuming project root. Do not search for or run `./scripts/uragenow-api.*` in the consuming project. Use the supplied client helper before writing a custom request: [`scripts/uragenow-api.mjs`](scripts/uragenow-api.mjs) is the cross-platform default with Node 18+ on Windows, macOS, or Linux; on Windows without Node, use [`scripts/uragenow-api.ps1`](scripts/uragenow-api.ps1). Execute only these named helper scripts or a deliberate custom HTTP client; never invent `.agents` paths, run JSON files with Node, or treat unrelated agent configuration as an API client. Do not use ad-hoc `curl` aliases or browser automation.
- Use direct HTTP requests to the running server. **Never use Playwright, browser automation, a browser window, or the Dashboard UI for API discovery, generation, polling, or downloads—even if the Dashboard is running.** Those are UI-testing tools only; use them solely when the user explicitly asks to test the Dashboard UI.
- Start with `GET {baseUrl}/api/llm-tools`. It supplies the live function manifest and is the authority for supported operations and optional fields. A successful response proves the API is reachable; the Dashboard page does not need to be open.
- Use [`resources/llm-tool-functions.json`](resources/llm-tool-functions.json) only as an offline routing aid when the live server is temporarily unavailable.


## Quick start

Use the supplied helper before creating custom HTTP code. This contacts the external API; it does not expect a server inside the current project. With the default local server and Node 18+:

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action health
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action manifest
```

When the user asks for image generation, do not write a plan, workflow summary, or example document instead. After obtaining approval when required, submit it once and keep the returned artifact record:

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action post-json --path /api/image-generate --json '{"prompt":"a small red toy robot","dashboardRequestId":"your-unique-request-id"}'
```

A successful image record contains `id`, `imageFileName`, and `imageUrl`. To save that returned image locally, use the returned `id` and `imageFileName` (not a job ID):

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action download --artifact-kind image --artifact-id <returned-id> --file <returned-imageFileName> --out <new-output-path>
```

On Windows without Node, use the equivalent PowerShell helper:

```powershell
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action health
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action post-json -Path /api/image-generate -Json '{"prompt":"a small red toy robot","dashboardRequestId":"your-unique-request-id"}'
```

Use a new output path: both download helpers refuse to overwrite an existing file.
If the calling shell has trouble preserving inline JSON, write valid JSON to a file and pass the file path. In PowerShell, use single-dash parameter names (`-Action`, not `--action`):

```powershell
# tmp-prompt.json contains the JSON object exactly, with normal double quotes.
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action post-json -Path /api/image-generate -JsonFile .\tmp-prompt.json
```

With Node:

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action post-json --path /api/image-generate --json-file ./tmp-prompt.json
```

Pass either inline JSON or a JSON file, never both. Do not escape the JSON inside the file as `\"...\"`.
For complete examples and failure handling, read [API usage](references/api-surface.md).
## Use the API

- Read [API usage](references/api-surface.md) before integrating media, Chat Studio, or file/history workflows.
- Read [LLM and tool resources](references/llm-and-tool-resources.md) for an LLM adapter or a handoff between two tools.
- Call a generation endpoint once. These requests can take minutes and normally wait for completion before returning the artifact on HTTP 200; ensure the calling command permits a long wait. Never resend the same request to poll, because it may generate another artifact. Always send a unique `dashboardRequestId` so a caller-side timeout can recover the job. The successful artifact record includes its `id`, file-name field, and relative download URL (`imageUrl`, `modelUrl`, `audioUrl`, or `videoUrl`). Use that URL or the helper's `download` action to retrieve the binary; a job ID is not a download ID.
- When a request was interrupted or timed out, use a caller-supplied unique `dashboardRequestId` and inspect `GET /api/generation-jobs?requestId=...`. Once it succeeds, call the helper `artifact` action with the job's `kind` and `artifactId` to recover the full record, then use its returned URL or `download` action. A tool-resource inbox is not generation status.
- Generate a 3D model only when the user explicitly requests one. A completed image request ends after returning or downloading its image artifact; do not infer a model-generation follow-up. When the user does request text-to-3D, first obtain an image, then invoke the live model-generation function with `imageInput`.
- Persist an inter-tool handoff through `POST /api/tool-resources`, rather than relying solely on an in-memory or `postMessage` payload.

## Authorization and results

- A model selecting a function is not permission to spend money, generate media, send messages, install software, launch desktop applications, modify files, or delete data. Obtain the user's approval for those operations.
- Return server errors and job failures to the caller. An artifact is ready only after the server returns a successful artifact record. Do not substitute a tutorial, command list, or generated document for an API action the user requested.
- Keep API credentials in the consuming project's local configuration or environment, never in this skill or source control.