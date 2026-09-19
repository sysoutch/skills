---
name: uragenow-api
description: Connect an application or LLM to a running URageNow Studio release API for media generation, tool-resource handoff, and Chat Studio workflows. Use when URageNow is available as a local or reachable HTTP server; do not use for generic HTTP APIs.
---

# URageNow Studio API Client

## Mandatory API-first rule

This skill is a portable HTTP client for a **running external URageNow server**, not a source-code integration. Loading it returns instructions only; it never returns a manifest or performs a request.

**Before any codebase search, file read, workspace inspection, browser action, or explanation, execute exactly one command from the consuming-project root:**

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action health
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action manifest
```

On Windows without Node, use:

```powershell
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action health
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action manifest
```

Do not search the workspace for `pixel-art`, `URageNow`, tool IDs, source code, `.env`, `config.json`, or manifests. Do not open the Dashboard, use Playwright, or use browser automation. The JSON printed by `manifest` is the only authoritative tool catalog. If either helper command fails, report its real error and stop; do not diagnose by searching the client project.

Use the exact paths above. They are relative to the consuming project root. Never run `./scripts/uragenow-api.*`, run a JSON file with Node, invent an `.agents` path, or treat `resources/llm-tool-functions.json` as live discovery. That JSON file is only a compact fallback when the direct server request is unavailable.

After a successful manifest, immediately invoke the requested operation with the same helper. A loaded-skill panel, commentary, a plan, or another code search is not an API action. Generation is only for a generation request; never replace a named transformation with `/api/image-generate`.
## Named-tool routing

When the user names a URage tool, its identity is a hard requirement. Use the exact matching function advertised by the live manifest; do not replace a transformation tool with `urage_generate_image` just because both produce images. An existing image is the named tool's input, not a prompt for a new image.

For **Pixel Art Converter**, first retain the source image record's `id` and `imageFileName`, then call the converter directly. Do not call `/api/image-generate` and do not open the Dashboard or Playwright:

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action post-json --path /api/tools/invoke --json '{"toolId":"art__pixel-art-converter","input":{"imageId":"<source-id>","imageFileName":"<source-imageFileName>","pixelSize":8}}'
```

The response is a new image artifact record. Download it with the normal `download` action using its returned `id` and `imageFileName`. The converter accepts images already held in URage image history. For a local attachment, import it once with the file helper—this is preferred because it avoids manually constructing JSON or base64—then use the returned source fields in every subsequent converter call. Do not generate a replacement:

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action import-image-file --source-file <local-image-path> --image-file-name source.png
```

```powershell
.\.agents\skills\URageNow\scripts\uragenow-api.ps1 -Action import-image-file -SourceFile <local-image-path> -ImageFileName source.png
```

Use `POST /api/image-import` only when the caller has attachment bytes as a data URL but no readable local file:

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action post-json --path /api/image-import --json '{"dataUrl":"data:image/png;base64,<base64-image-bytes>","fileName":"source.png"}'
```

For **Normalmap Maker** and **Image To Ascii**, preserve those same source fields and invoke the named tool. Neither operation is image generation:

```sh
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action post-json --path /api/tools/invoke --json '{"toolId":"art__normalmap-maker","input":{"imageId":"<source-id>","imageFileName":"<source-imageFileName>","strength":2}}'
node .agents/skills/URageNow/scripts/uragenow-api.mjs --action post-json --path /api/tools/invoke --json '{"toolId":"art__image-to-ascii","input":{"imageId":"<source-id>","imageFileName":"<source-imageFileName>","columns":96}}'
```

Normalmap Maker returns an imported normal-map image. Image To Ascii returns an imported preview image plus `asciiText`, `columns`, and `rows`. Use the live manifest for available tools and their exact schemas; only tools marked `execution: "server"` can be invoked through the API.
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

Pass either inline JSON or a JSON file, never both. Do not escape the JSON inside the file as `\\"...\\"`. CRLF and LF line endings are both valid: do not switch to inline JSON or Linux to work around line endings. `Invalid JSON primitive` or a JSON syntax error means the caller supplied malformed or shell-mangled JSON, not that the line endings are wrong. JSON-file fallback accepts PNG, JPEG, and other formats Sharp can decode; Pixel Art Converter is not JPEG-only.
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