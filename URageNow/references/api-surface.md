# URageNow Studio release API usage

All paths below are relative to the configured URageNow API base URL. The local default is `http://127.0.0.1:4782`; releases may override it with `DASHBOARD_PORT`. Use the base URL supplied by the project's configuration or user, then confirm it with direct `GET /health` or `GET /api/llm-tools`. Do not scan ports or open a browser to discover the server. Use the live `GET /api/llm-tools` manifest before constructing a generation request; providers and optional inputs can vary by the installed release.

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
- Treat a returned job or artifact identifier as the canonical reference; do not create local filesystem paths for server-side artifacts.
- Fetch history, job status, or artifact files using endpoints made available by the release when a generation response is asynchronous or incomplete.
- Use `Content-Type: application/json` for JSON endpoints unless the live manifest specifies a file or multipart request.
- Surface non-success HTTP status, provider errors, and failed jobs to the user. Do not substitute a fabricated success result.
## Generation completion and recovery

Generation endpoints are synchronous: retain the original `POST` until it completes. A successful HTTP `200` contains the completed artifact, so do not repeat a generation request as a polling operation.

If a caller loses the response, submit a unique `dashboardRequestId` in the original request and query `GET /api/generation-jobs?requestId=...`. `GET /api/generation-jobs` also accepts `jobId`, `kind` (`image`, `model3d`, `audio`, `music`, or `video`), and `limit`. Job records identify the status, artifact ID, and any error. Tool-resource inboxes are only for handoff delivery and must not be used as generation status.
## Cross-platform client helper

Use `node scripts/uragenow-api.mjs --action health` for read-only health checks on Windows, macOS, or Linux (Node 18+). It also supports `manifest`, `jobs`, `get`, and `post-json`; set `URAGE_API_BASE_URL` and `URAGE_API_TOKEN` in the caller's local environment when needed. Windows PowerShell users may instead run `scripts/uragenow-api.ps1`. Both helpers perform direct HTTP only and do not launch a browser.