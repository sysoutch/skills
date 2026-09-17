---
name: uragenow-api
description: Connect an application or LLM to a running URageNow Studio release API for media generation, tool-resource handoff, and Chat Studio workflows. Use when URageNow is available as a local or reachable HTTP server; do not use for generic HTTP APIs.
---

# URageNow Studio API Client

Use this skill from a project that consumes a running URageNow Studio release. It does not require the URageNow source repository.

## Connect

- Obtain the configured API base URL and any required authorization from the user or the project's existing configuration. If a base URL is not supplied, use the local default `http://127.0.0.1:4782`; the release owner can change it with `DASHBOARD_PORT`, so do not guess another port or scan ports.
- Confirm the selected base URL with a direct `GET {baseUrl}/health` or `GET {baseUrl}/api/llm-tools` request. If the default does not respond, ask the user for their configured base URL or port.
- `localhost` or `127.0.0.1` works only when the caller and URageNow run on the same machine. A different device needs a reachable host, firewall rules, and any required CORS configuration.
- Use direct HTTP requests to the running server. Do **not** launch a browser, navigate the Dashboard root, or use Playwright/browser automation to discover or invoke the API unless the user specifically asks to test the Dashboard UI.
- Start with `GET {baseUrl}/api/llm-tools`. It supplies the live function manifest and is the authority for supported operations and optional fields. A successful response proves the API is reachable; the Dashboard page does not need to be open.
- Use [`resources/llm-tool-functions.json`](resources/llm-tool-functions.json) only as an offline routing aid when the live server is temporarily unavailable.

## Use the API

- Read [API usage](references/api-surface.md) before integrating media, Chat Studio, or file/history workflows.
- Read [LLM and tool resources](references/llm-and-tool-resources.md) for an LLM adapter or a handoff between two tools.
- Call the existing generation endpoints for image, 3D, audio, music, and video. Do not reimplement their provider workflows in the client.
- For text-to-3D, first obtain an image, then invoke the live model-generation function with `imageInput`.
- Persist an inter-tool handoff through `POST /api/tool-resources`, rather than relying solely on an in-memory or `postMessage` payload.

## Authorization and results

- A model selecting a function is not permission to spend money, generate media, send messages, install software, launch desktop applications, modify files, or delete data. Obtain the user's approval for those operations.
- Return server errors and job failures to the caller. An artifact is ready only after the server returns a successful artifact record.
- Keep API credentials in the consuming project's local configuration or environment, never in this skill or source control.