---
name: uragenow-api
description: Use the URageNow MCP server for URage Studio media generation, named server tools, and tool-resource handoff. Use direct HTTP only when MCP is unavailable.
---

# URageNow Studio

## Skill location

For users who have it installed, `%USERPROFILE%\.agents\skills\URageNow` is the source of truth. Use that global folder for skill scripts and references to avoid ambiguity with a repository mirror. The checked-in `.agents\skills\URageNow` copy is a compatibility mirror; use it only when the global skill is unavailable, and keep both copies synchronized when this skill changes.

## Project context

An absolute helper path does not change the process working directory. Invoke the global helper from the target project root so relative `--source-file`, `--json-file`, and `--out` paths resolve there. To target another project, change location explicitly (for example, `Push-Location C:\Path\To\Project` before the command and `Pop-Location` afterward) or provide absolute paths.

Use the configured `uragenow` MCP server first. It exposes the live media API, server-capable tools, artifact downloads, generation recovery, and persistent tool-resource handoffs. MCP tool descriptions and server instructions are the operational contract; loading this skill does not perform an API request.

Do not use browser automation or Playwright for URageNow. For a named tool, call its exact MCP tool or `urage_invoke_tool`; never substitute generic image generation. For a self-contained HTML page, use `urage_split_html_document`, download the three returned artifacts to the tool folder, and verify the resulting relative links before replacing the source page. A successful generation returns the artifact fields needed for download. For 3D from a generated image, pass only its returned `id` and `imageFileName` to `urage_generate_model3d_from_image`; it retrieves the source bytes internally. The source image is authoritative: do not include a text prompt or a relative download URL as `imageInput`. Do not infer 3D generation from an image request.

## Setup and fallback

Run [`scripts/install-uragenow-mcp.ps1`](scripts/install-uragenow-mcp.ps1) for Cline or [`scripts/install-uragenow-codex-mcp.ps1`](scripts/install-uragenow-codex-mcp.ps1) for Codex, then restart the host. Both install the portable `uragenow-mcp` command and configure `http://127.0.0.1:4782` by default; use `URAGE_API_BASE_URL` or `-ApiBaseUrl` for another port.

If MCP is unavailable, use the global Node or PowerShell helper. First run its `health` action, then `manifest`; the live manifest is the HTTP source of truth. Use `post-json` only for a manifest-advertised endpoint, preserve the returned artifact fields for download, and never use browser automation. If the global skill is unavailable, use the matching checked-in mirror.

```sh
node "$USERPROFILE/.agents/skills/URageNow/scripts/uragenow-api.mjs" --action health
node "$USERPROFILE/.agents/skills/URageNow/scripts/uragenow-api.mjs" --action manifest
```

```powershell
& "$env:USERPROFILE\.agents\skills\URageNow\scripts\uragenow-api.ps1" -Action health
& "$env:USERPROFILE\.agents\skills\URageNow\scripts\uragenow-api.ps1" -Action manifest
```
