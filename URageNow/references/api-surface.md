# URageNow Studio release API usage

All paths below are relative to the configured URageNow API base URL. The local default is `http://127.0.0.1:4782`; releases may override it with `DASHBOARD_PORT`. Use the base URL supplied by the project's configuration or user, then confirm it with direct `GET /health` or `GET /api/llm-tools`. Do not scan ports or open a browser to discover the server. Use the live `GET /api/llm-tools` manifest before constructing a generation request; providers and optional inputs can vary by the installed release.


## Copyable helper commands

Use the included helper before writing custom code. Node 18+ is the default on Windows, macOS, and Linux; it needs no package installation.

```sh
# Confirm the configured/default server, then obtain the current capabilities.
node scripts/uragenow-api.mjs --action health
node scripts/uragenow-api.mjs --action manifest

# Only after the user has approved this generation request.
node scripts/uragenow-api.mjs --action post-json --path /api/image-generate --json '{"prompt":"a small red toy robot","dashboardRequestId":"your-unique-request-id"}'

# Save a completed image using id and imageFileName from that response.
node scripts/uragenow-api.mjs --action download --artifact-kind image --artifact-id <returned-id> --file <returned-imageFileName> --out <new-output-path>
```

On Windows without Node:

```powershell
.\scripts\uragenow-api.ps1 -Action health
.\scripts\uragenow-api.ps1 -Action manifest
.\scripts\uragenow-api.ps1 -Action post-json -Path /api/image-generate -Json '{"prompt":"a small red toy robot","dashboardRequestId":"your-unique-request-id"}'
.\scripts\uragenow-api.ps1 -Action download -ArtifactKind image -ArtifactId <returned-id> -File <returned-imageFileName> -OutFile <new-output-path>
```

`dashboardRequestId` is caller-chosen and must be unique per generation attempt. It lets a client recover an interrupted response; it is not a download identifier. `imageUrl`, `modelUrl`, `audioUrl`, and `videoUrl` are paths relative to `baseUrl`, so a custom client resolves them as `{baseUrl}{returnedUrl}`.

## Failure handling

| Result | Meaning | Correct next action |
| --- | --- | --- |
| Network timeout or lost response | The server may still be generating. | Do not repeat the POST. Query `jobs` with the original `dashboardRequestId`. |
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
| 3D model generation | `POST /api/model3d-generate` | `imageInput` | model artifact record |
| Sound/audio generation | `POST /api/audio-generate` | `prompt` | audio artifact record |
| Music generation | `POST /api/music-generate` | release-specific workflow inputs | music artifact record |
| Video generation | `POST /api/video-generate` | `prompt` | video artifact record |

The release may also offer image transformations, model editing/validation, speech, media inspection, generated-artifact history, and job-status routes. Use only routes advertised by the running release or documented by its installed API UI.

## Client rules

- Call the configured API base URL directly with an HTTP client. Do not start Playwright, open `{baseUrl}/`, or automate the Dashboard page for API discovery or generation; those are UI-testing actions, not API integration.

- Send the server's configured authorization header or credential with every request that requires it. Do not expose a privileged token in browser code.
- Treat a returned artifact record as the canonical download reference. It includes its `id`, file-name field, and a relative URL: `imageUrl`, `modelUrl`, `audioUrl`, or `videoUrl`. Resolve that URL against `baseUrl`, or use the supplied `download` helper action. A job ID is only for recovery/status and cannot download an artifact.
- Fetch history, job status, or artifact files using endpoints made available by the release when a generation response is asynchronous or incomplete.
- Use `Content-Type: application/json` for JSON endpoints unless the live manifest specifies a file or multipart request.
- Surface non-success HTTP status, provider errors, and failed jobs to the user. Do not substitute a fabricated success result.
## Generation completion and recovery

Generation endpoints are synchronous: retain the original `POST` until it completes. A successful HTTP `200` contains the completed artifact, so do not repeat a generation request as a polling operation.

If a caller loses the response, submit a unique `dashboardRequestId` in the original request and query `GET /api/generation-jobs?requestId=...`. `GET /api/generation-jobs` also accepts `jobId`, `kind` (`image`, `model3d`, `audio`, `music`, or `video`), and `limit`. Job records identify the status, artifact ID, and any error. Tool-resource inboxes are only for handoff delivery and must not be used as generation status.
## Cross-platform client helper

Use `node scripts/uragenow-api.mjs --action health` for read-only health checks on Windows, macOS, or Linux (Node 18+). Use this helper first: it supports `manifest`, `jobs`, `get`, `post-json`, and binary `download`; set `URAGE_API_BASE_URL` and `URAGE_API_TOKEN` in the caller's local environment when needed. For example, after an image response, run `node scripts/uragenow-api.mjs --action download --artifact-kind image --artifact-id <id> --file <imageFileName> --out <new-local-path>`. It refuses to overwrite an existing output. Windows PowerShell users without Node may instead run `scripts/uragenow-api.ps1 -Action download -ArtifactKind image -ArtifactId <id> -File <imageFileName> -OutFile <new-local-path>`. Both helpers perform direct HTTP only and do not launch a browser.