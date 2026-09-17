# LLM and tool-resource integration

## LLM function discovery

Request `GET {baseUrl}/api/llm-tools` from the running, authenticated release. The response is the source of truth for callable functions, endpoint paths, JSON schemas, and optional generation parameters. A compatibility fallback may be available at `GET {baseUrl}/api/tool-resources?schema=1`.

The standard release functions cover image, 3D model, audio, music, and video generation plus generation-job inspection, resource listing, and handoff. Let the LLM select from the live manifest, validate arguments against its schemas, and call the specified path relative to `baseUrl`.

Generation POST endpoints wait for completion and return the artifact on success. Do not repeat them to poll. For recovery after a client timeout, provide a unique `dashboardRequestId` in the original request and call `GET /api/generation-jobs?requestId=...`; the same route accepts `jobId`, `kind`, and `limit`.

## Tool-resource lifecycle

Use persistent resources when one tool needs to pass text or an artifact to another tool:

1. `POST {baseUrl}/api/tool-resources` with `targetToolId`, `resourceKind`, provenance, and one of `dataUrl`, `sourceUrl`, or `textContent`.
2. Keep the returned resource record or ID.
3. The target reads `GET {baseUrl}/api/tool-resources?targetToolId=...` or resolves the resource by the release-supported ID path.
4. The receiving tool imports the resource through its own normal input flow.

Supported resource kinds are `text`, `image`, `gif`, `model3d`, `video`, `audio`, `music`, and `file`. Receipt confirms delivery only; it does not confirm that the target tool successfully processed the resource.

## Safety boundary

Function discovery does not bypass authentication or grant action permission. Ask before costly generation, outgoing messages, installation, launching local software, file mutation, or deletion. Preserve enough server error detail for the caller to distinguish missing configuration, an unavailable provider, and a rejected request.