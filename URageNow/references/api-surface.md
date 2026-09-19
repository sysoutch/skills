# URageNow Studio release API usage

All paths below are relative to the configured URageNow API base URL. The API server is an external runtime, not a component of the consuming project. The local default is `http://127.0.0.1:4782`. Use the base URL supplied by the project's configuration or user, then directly confirm it with `GET /health` or `GET /api/llm-tools`. Never inspect the client workspace or require source files to decide whether the server exists; do not scan ports or open a browser to discover it. Use the live `GET /api/llm-tools` manifest before constructing a generation request; providers and optional inputs can vary by the installed release.


## Client/server boundary

This skill contains only a portable client. It knows the public HTTP contract and must not make claims about a local URageNow repository, installation layout, or server process from the consuming project's directory. When the user provides a base URL or says the server is running, test that URL directly. A successful /health response is the evidence needed to proceed; a failed request is the only evidence of an unavailable or misconfigured server.

## Execute, do not reload

Skill loading returns portable instructions, never a live URageNow response. The first operation after loading is the exact `health` helper command from the copied skill; after it succeeds, run `manifest` and retain both results. Do not reload the skill as an API action, and do not search or inspect the consuming workspace (`.env`, `config.json`, source, package files, or agent settings) before those commands. A helper error is the only evidence to diagnose.
## Agent execution contract

API work is complete only when its matching helper command has run and produced a result. Narration, a loaded-skill response, a plan, or a command template is not a server action. For a requested image, execute the fixed sequence: health and manifest when not already known, one image POST, then a download using the returned image `id` and `imageFileName` to a new local output path. Preserve that artifact record and report the saved path. Do not reload this skill or create unrelated files between those operations, and do not begin a different media workflow unless the user explicitly asks for it.
## Copyable helper commands

Use the included helper before writing custom code. From the consuming project root, use exactly `.agents/skills/URageNow/scripts/uragenow-api.mjs` or `.agents/skills/URageNow/scripts/uragenow-api.ps1`. The shorter `scripts/...` path is relative only to the URageNow skill folder. Never search for or execute a similarly named `./scripts/...` file in the consuming project, invent other `.agents` paths, or run a JSON file as a Node program.

```sh
# Confirm the configured/default server, then obtain the current capabilities.
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action health
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action manifest

# Only after the user has approved this generation request.
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action post-json --path /api/image-generate --json '{"prompt":"a small red toy robot","dashboardRequestId":"your-unique-request-id"}'

# Save a completed image using id and imageFileName from that response.
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action download --artifact-kind image --artifact-id <returned-id> --file <returned-imageFileName> --out <new-output-path>
```

On Windows without Node:

```powershell
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action health
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action manifest
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action post-json -Path /api/image-generate -Json '{"prompt":"a small red toy robot","dashboardRequestId":"your-unique-request-id"}'
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action download -ArtifactKind image -ArtifactId <returned-id> -File <returned-imageFileName> -OutFile <new-output-path>
```

`dashboardRequestId` is caller-chosen and must be unique per generation attempt. It lets a client recover an interrupted response; it is not a download identifier. Recovery returns a job's `artifactId`; use `node .agents/skills/URageNow/scripts/uragenow-api.mjs --action artifact --artifact-kind image --artifact-id <artifactId>` (or the PowerShell equivalent) to retrieve the full artifact record. `imageUrl`, `modelUrl`, `audioUrl`, and `videoUrl` are paths relative to `baseUrl`, so a custom client resolves them as `{baseUrl}{returnedUrl}`.


## JSON-file fallback

When an outer shell or agent runner cannot preserve inline JSON, write the payload as ordinary JSON (for example `{"prompt":"..."}`) to a local file and pass that path. Do not double-escape the quotes inside the file.

```powershell
# Native PowerShell parameters use one dash.
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action post-json -Path /api/image-generate -JsonFile .\tmp-prompt.json
```

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action post-json --path /api/image-generate --json-file ./tmp-prompt.json
```

Use exactly one payload option: PowerShell `-Json` or `-JsonFile`; Node `--json` or `--json-file`.
## Failure handling

| Result | Meaning | Correct next action |
| --- | --- | --- |
| Network timeout or lost response | The server may still be generating. | Do not repeat the POST. Query `jobs` with the original `dashboardRequestId`; on success, call `artifact` using the returned `kind` and `artifactId`. |
| HTTP 400 | Invalid or unsupported request fields. | Read the error body and the live manifest, correct the input, then make a new request only if the user still approves it. |
| HTTP 401 or 403 | Missing, invalid, or unauthorized access token. | Check `URAGE_API_TOKEN` / `x-dashboard-access-token`; do not print the token. |
| HTTP 404 | Wrong base URL/path, or an unknown artifact id/file name. | Reconfirm `/health`, use the live manifest, and use the artifact fields returned by generation. |
| HTTP 5xx | Provider or server failure. | Surface the error; retry only with user approval and a new `dashboardRequestId`. |

## Credential handling

Set `URAGE_API_BASE_URL` and `URAGE_API_TOKEN` only in the consuming project's local environment or secret store. The helpers send the token as `x-dashboard-access-token`. Never place either value in source control, browser-delivered code, prompts, screenshots, or command output. If a token is exposed, the release owner must replace it using that deployment's credential procedure; the portable client cannot rotate a server token.
## Core workflows

| Operation | Endpoint | Minimum input | Expected result |
| --- | --- | --- | --- |
| Chat Studio response | `POST /api/ask` or `POST /api/ask-stream` | message/workflow input | chat response or stream |
| Image generation | `POST /api/image-generate` | `prompt` | image artifact record |
| Server-capable tool | `POST /api/tools/invoke` | `toolId`, `input` | tool result; inspect `/api/llm-tools` capabilities |
| 3D model generation | `POST /api/model3d-generate` | `imageInput` | model artifact record |
| Sound/audio generation | `POST /api/audio-generate` | `prompt` | audio artifact record |
| Music generation | `POST /api/music-generate` | release-specific workflow inputs | music artifact record |
| Video generation | `POST /api/video-generate` | `prompt` | video artifact record |
| Recover artifact record | `GET /api/generated-artifact?kind={kind}&id={artifactId}` | job `kind` and `artifactId` | completed artifact record |

The release may also offer image transformations, model editing/validation, speech, media inspection, generated-artifact history, and job-status routes. Use only routes advertised by the running release or documented by its installed API UI.

## Client rules

- Call the configured API base URL directly with an HTTP client. Never start Playwright, open `{baseUrl}/`, or automate the Dashboard page for API discovery, generation, polling, or downloads, even when the Dashboard is running; those are UI-testing actions, not API integration.

- Send the server's configured authorization header or credential with every request that requires it. Do not expose a privileged token in browser code.
- Treat a returned artifact record as the canonical download reference. It includes its `id`, file-name field, and a relative URL: `imageUrl`, `modelUrl`, `audioUrl`, or `videoUrl`. Resolve that URL against `baseUrl`, or use the supplied `download` helper action. A job ID is only for recovery/status and cannot download an artifact.
- Fetch history, job status, or artifact files using endpoints made available by the release when a generation response is asynchronous or incomplete.
- Use `Content-Type: application/json` for JSON endpoints unless the live manifest specifies a file or multipart request.
- Surface non-success HTTP status, provider errors, and failed jobs to the user. Do not substitute a fabricated success result.
## Generation completion and recovery

Generation endpoints can take minutes. Retain the original `POST` until it completes when the calling environment allows it; otherwise, recover using the original `dashboardRequestId`. A successful HTTP `200` contains the completed artifact, so do not repeat a generation request as a polling operation.

If a caller loses the response, query `GET /api/generation-jobs?requestId=...` using the unique `dashboardRequestId` from the original request. `GET /api/generation-jobs` also accepts `jobId`, `kind` (`image`, `model3d`, `audio`, `music`, or `video`), and `limit`. On success, call `GET /api/generated-artifact?kind={kind}&id={artifactId}` to retrieve the completed record with its download URL and file name. Tool-resource inboxes are only for handoff delivery and must not be used as generation status.
## Cross-platform client helper

Use `node .agents/skills/URageNow/scripts/uragenow-api.mjs --action health` for read-only health checks on Windows, macOS, or Linux (Node 18+). Use this helper first: it supports `manifest`, `jobs`, `artifact`, `get`, `post-json`, `import-image-file`, and binary `download`. Use `import-image-file --source-file <local-image-path>` to import a local image without writing a base64 JSON payload; set `URAGE_API_BASE_URL` and `URAGE_API_TOKEN` in the caller's local environment when needed. For example, after an image response, run `node .agents/skills/URageNow/scripts/uragenow-api.mjs --action download --artifact-kind image --artifact-id <id> --file <imageFileName> --out <new-local-path>`. It refuses to overwrite an existing output. Windows PowerShell users without Node may instead run `.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action download -ArtifactKind image -ArtifactId <id> -File <imageFileName> -OutFile <new-local-path>`. Both helpers perform direct HTTP only and do not launch a browser.