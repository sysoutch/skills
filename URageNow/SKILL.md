---
name: uragenow-api
description: Connect an application or LLM to a running URageNow Studio release API for media generation, tool-resource handoff, and Chat Studio workflows. Use when URageNow is available as a local or reachable HTTP server; do not use for generic HTTP APIs.
---

# URageNow Studio API Client

Use this skill from any client project that consumes a running URageNow Studio release. The API server is intentionally external to the client project: it may already be running on the same computer or another reachable machine. Do not inspect the client workspace for URageNow source files, require a source checkout, or infer that the server is absent because this project does not contain it.

## Connect

- Obtain the configured API base URL and any required authorization from the user or the project's existing configuration. If a base URL is not supplied, use the local default `http://127.0.0.1:4782`; do not guess another port or scan ports.
- Treat a base URL supplied by the user, or their statement that URageNow is already running, as authority to contact that external server. Immediately run the supplied helper's `health` action against that URL. Never decide the server is unavailable from the client project's files. Only if the direct health request fails should you report the actual failure and ask for the configured URL or port.
- `localhost` or `127.0.0.1` works only when the caller and URageNow run on the same machine. A different device needs a reachable host, firewall rules, and any required CORS configuration.
- Loading this skill provides instructions; it does not itself perform network requests. Use the supplied client helper before writing a custom request: [`scripts/uragenow-api.mjs`](scripts/uragenow-api.mjs) is the cross-platform default with Node 18+ on Windows, macOS, or Linux; on Windows without Node, use [`scripts/uragenow-api.ps1`](scripts/uragenow-api.ps1). Use custom HTTP only when the helper lacks the required operation. Do not use ad-hoc `curl` aliases or browser automation.
- Use direct HTTP requests to the running server. Do **not** launch a browser, navigate the Dashboard root, or use Playwright/browser automation to discover or invoke the API unless the user specifically asks to test the Dashboard UI.
- Start with `GET {baseUrl}/api/llm-tools`. It supplies the live function manifest and is the authority for supported operations and optional fields. A successful response proves the API is reachable; the Dashboard page does not need to be open.
- Use [`resources/llm-tool-functions.json`](resources/llm-tool-functions.json) only as an offline routing aid when the live server is temporarily unavailable.


## Quick start

Use the supplied helper before creating custom HTTP code. This contacts the external API; it does not expect a server inside the current project. With the default local server and Node 18+:

```sh
node scripts/uragenow-api.mjs --action health
node scripts/uragenow-api.mjs --action manifest
```

When the user asks for image generation, do not write a plan, workflow summary, or example document instead. After obtaining approval when required, submit it once and keep the returned artifact record:

```sh
node scripts/uragenow-api.mjs --action post-json --path /api/image-generate --json '{"prompt":"a small red toy robot","dashboardRequestId":"your-unique-request-id"}'
```

A successful image record contains `id`, `imageFileName`, and `imageUrl`. To save that returned image locally, use the returned `id` and `imageFileName` (not a job ID):

```sh
node scripts/uragenow-api.mjs --action download --artifact-kind image --artifact-id <returned-id> --file <returned-imageFileName> --out <new-output-path>
```

On Windows without Node, use the equivalent PowerShell helper:

```powershell
.\scripts\uragenow-api.ps1 -Action health
.\scripts\uragenow-api.ps1 -Action post-json -Path /api/image-generate -Json '{"prompt":"a small red toy robot","dashboardRequestId":"your-unique-request-id"}'
```

Use a new output path: both download helpers refuse to overwrite an existing file. For complete examples and failure handling, read [API usage](references/api-surface.md).
## Use the API

- Read [API usage](references/api-surface.md) before integrating media, Chat Studio, or file/history workflows.
- Read [LLM and tool resources](references/llm-and-tool-resources.md) for an LLM adapter or a handoff between two tools.
- Call a generation endpoint once. These requests normally wait for completion and return the completed artifact on HTTP 200; never resend the same request to poll, because it may generate another artifact. The successful artifact record includes its `id`, file-name field, and relative download URL (`imageUrl`, `modelUrl`, `audioUrl`, or `videoUrl`). Use that URL or the helper's `download` action to retrieve the binary; a job ID is not a download ID.
- When a request was interrupted or timed out, use a caller-supplied unique `dashboardRequestId` and inspect `GET /api/generation-jobs?requestId=...`. A tool-resource inbox is not generation status.
- Generate a 3D model only when the user explicitly requests one. A completed image request ends after returning or downloading its image artifact; do not infer a model-generation follow-up. When the user does request text-to-3D, first obtain an image, then invoke the live model-generation function with `imageInput`.
- Persist an inter-tool handoff through `POST /api/tool-resources`, rather than relying solely on an in-memory or `postMessage` payload.

## Authorization and results

- A model selecting a function is not permission to spend money, generate media, send messages, install software, launch desktop applications, modify files, or delete data. Obtain the user's approval for those operations.
- Return server errors and job failures to the caller. An artifact is ready only after the server returns a successful artifact record. Do not substitute a tutorial, command list, or generated document for an API action the user requested.
- Keep API credentials in the consuming project's local configuration or environment, never in this skill or source control.