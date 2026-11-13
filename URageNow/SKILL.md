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

For a lighter, game-ready mesh that keeps the model's own look and texture, **remesh** it with `urage_remesh_model` (the Studio's Remesh quick action, `POST /api/model3d-remesh`). Blender rebuilds the topology to `targetFaces` (default 5000), unwraps UVs and bakes the original base colour plus a normal map onto the new mesh. The result is a **new** model entry (the source is untouched); download its `generated.modelFileName` with `urage_download_artifact` (kind `model3d`). Methods: `quadriflow` (default, clean quads, headless), `voxel` (robust on broken meshes, approximate count, headless), `quadremesher` (needs the Exoside Quad Remesher add-on and briefly opens a Blender window). Pick the baker with `bakeEngine`: `builtin` (Blender Cycles, default) or `bakelab` (the BakeLab2 add-on; opens a Blender window), and the maps with `bakeMaps`. The script is `blender-scripts/remesh/remesh_model.py` in the URageNow repo.

To **bake** a texture set without remeshing, use `urage_bake_model` (the Studio's Bake quick action, `POST /api/model3d-bake`): without `sourceModelId` it flattens the model's own materials into one PBR material; with `sourceModelId` it bakes that high-poly model onto this one (for example onto a remeshed or hand-made low-poly copy). Maps: `albedo`, `normal`, `roughness`, `metallic` (built-in only), `ao` (multiplied into albedo), `emission`. The result is a new model entry. The script is `blender-scripts/bake/bake_maps.py`.

## 3D quick actions

Find a model id with `urage_list_models`, then run any 3D Studio quick action with `urage_model3d_quick_action` (`modelId`, `action`, optional `options` passed to the endpoint):

| action | What it does | Result |
|---|---|---|
| `remesh` | Lighter mesh that keeps its look (see above) | new model |
| `bake` | PBR texture set from own materials or a `sourceModelId` | new model |
| `lowpoly` | Deliberate low-poly, palette-painted look | `lowPolyModelFileName` on the same model |
| `separate_loose_parts` | One model per loose part (`exportMode: "single_file"` keeps one file) | new models |
| `albedo_to_geometry` | Displace the mesh from its albedo brightness | `albedoGeometryModelFileName` |
| `real_life_scale` | LLM estimates the real height and scales the model | updated model |
| `delight` / `rotate` | Flat-lit capture / turntable capture | new image (kind `image`) |
| `generate_lods` | LODs from `targetFaceCounts` | `lodArtifacts` |
| `autorig` | Auto-rig (`rigProfile`: `auto`, `human`, `quadruped`) | updated model |

Blender actions can take minutes; call once and wait, never resend to poll.

Use `urage_generate_lowpoly_model` (the Studio's Create Lowpoly button) **only for a deliberate low-poly look**: it decimates to a target face count and paints every face from a small colour-palette UV texture (the LowPolyUV add-on), so the original texture detail is gone. Pass the generated model's `id` and a `targetFaces` count (or `llmTargetFaces: true` to let the server choose), then download the returned `lowPolyModelFileName` with `urage_download_artifact` (kind `model3d`). Over HTTP it is `POST /api/model3d-lowpoly-generate`, which the manifest does not list.

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
