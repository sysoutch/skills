#!/usr/bin/env node
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const baseUrl = (process.env.URAGE_API_BASE_URL || "http://127.0.0.1:4782").trim().replace(/\/+$/, "");
const token = (process.env.URAGE_API_TOKEN || "").trim();
const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff" };
const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const tools = [
  { name: "urage_health", description: "Check the configured URageNow API without opening a browser.", inputSchema: object({}) },
  { name: "urage_get_manifest", description: "Read the live URageNow manifest before selecting an unfamiliar tool.", inputSchema: object({}) },
  { name: "urage_import_image_file", description: "Import a readable local image file and return id plus imageFileName for transformations.", inputSchema: object({ sourceFile: { type: "string" }, imageFileName: { type: "string" } }, ["sourceFile"]) },
  { name: "urage_invoke_tool", description: "Invoke an exact server-capable URage tool. Never replace a named transformation with generation.", inputSchema: object({ toolId: { type: "string" }, input: { type: "object" } }, ["toolId", "input"]) },
  { name: "urage_convert_to_pixel_art", description: "Transform an existing URage image with Pixel Art Converter; never generate a replacement.", inputSchema: object({ imageId: { type: "string" }, imageFileName: { type: "string" }, pixelSize: { type: "number", minimum: 2, maximum: 256 } }, ["imageId", "imageFileName"]) },
  { name: "urage_create_normal_map", description: "Transform an existing URage image with Normalmap Maker; never generate a replacement.", inputSchema: object({ imageId: { type: "string" }, imageFileName: { type: "string" }, strength: { type: "number", minimum: 0.1, maximum: 10 } }, ["imageId", "imageFileName"]) },
  { name: "urage_convert_image_to_ascii", description: "Transform an existing URage image with Image To Ascii; returns image artifact and text.", inputSchema: object({ imageId: { type: "string" }, imageFileName: { type: "string" }, columns: { type: "number", minimum: 16, maximum: 160 } }, ["imageId", "imageFileName"]) },
  { name: "urage_download_image", description: "Download an image artifact to a new local path without overwriting files.", inputSchema: object({ imageId: { type: "string" }, imageFileName: { type: "string" }, outputPath: { type: "string" } }, ["imageId", "imageFileName", "outputPath"]) }
];

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required.");
  return value.trim();
}
function boundedNumber(value, label, min, max) {
  if (value === undefined) return undefined;
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(label + " must be between " + min + " and " + max + ".");
  return result;
}
async function api(endpoint, method = "GET", body) {
  const headers = { accept: "application/json" };
  if (token) headers["x-dashboard-access-token"] = token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(baseUrl + endpoint, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(1200000) });
  const text = await response.text();
  let payload = text; try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error("URageNow API " + response.status + ": " + (typeof payload === "string" ? payload : JSON.stringify(payload)));
  return payload;
}
async function importFile(args) {
  const sourceFile = path.resolve(requireText(args.sourceFile, "sourceFile"));
  try { await access(sourceFile); } catch { throw new Error("sourceFile was not found: " + sourceFile); }
  const contentType = mime[path.extname(sourceFile).toLowerCase()];
  if (!contentType) throw new Error("sourceFile must be PNG, JPEG, GIF, WebP, AVIF, BMP, TIFF, or TIF.");
  const bytes = await readFile(sourceFile);
  return api("/api/image-import", "POST", { dataUrl: "data:" + contentType + ";base64," + bytes.toString("base64"), fileName: typeof args.imageFileName === "string" && args.imageFileName.trim() ? args.imageFileName.trim() : path.basename(sourceFile) });
}
async function invoke(toolId, input) { return api("/api/tools/invoke", "POST", { toolId, input }); }
async function download(args) {
  const outputPath = path.resolve(requireText(args.outputPath, "outputPath"));
  try { await access(outputPath); throw new Error("Refusing to overwrite existing file: " + outputPath); } catch (error) { if (error && error.code !== "ENOENT") throw error; }
  const query = new URLSearchParams({ imageId: requireText(args.imageId, "imageId"), file: requireText(args.imageFileName, "imageFileName") });
  const response = await fetch(baseUrl + "/api/generated-image-file?" + query, { headers: token ? { "x-dashboard-access-token": token } : {}, signal: AbortSignal.timeout(1200000) });
  if (!response.ok) throw new Error("URageNow API " + response.status + ": image download failed.");
  const bytes = Buffer.from(await response.arrayBuffer()); await writeFile(outputPath, bytes, { flag: "wx" });
  return { path: outputPath, bytes: bytes.length, contentType: response.headers.get("content-type") };
}
async function call(name, args = {}) {
  switch (name) {
    case "urage_health": return api("/health");
    case "urage_get_manifest": return api("/api/llm-tools");
    case "urage_import_image_file": return importFile(args);
    case "urage_invoke_tool": {
      if (!args.input || typeof args.input !== "object" || Array.isArray(args.input)) throw new Error("input must be an object.");
      return invoke(requireText(args.toolId, "toolId"), args.input);
    }
    case "urage_convert_to_pixel_art": {
      const pixelSize = boundedNumber(args.pixelSize, "pixelSize", 2, 256);
      return invoke("art__pixel-art-converter", { imageId: requireText(args.imageId, "imageId"), imageFileName: requireText(args.imageFileName, "imageFileName"), ...(pixelSize === undefined ? {} : { pixelSize }) });
    }
    case "urage_create_normal_map": {
      const strength = boundedNumber(args.strength, "strength", 0.1, 10);
      return invoke("art__normalmap-maker", { imageId: requireText(args.imageId, "imageId"), imageFileName: requireText(args.imageFileName, "imageFileName"), ...(strength === undefined ? {} : { strength }) });
    }
    case "urage_convert_image_to_ascii": {
      const columns = boundedNumber(args.columns, "columns", 16, 160);
      return invoke("art__image-to-ascii", { imageId: requireText(args.imageId, "imageId"), imageFileName: requireText(args.imageFileName, "imageFileName"), ...(columns === undefined ? {} : { columns }) });
    }
    case "urage_download_image": return download(args);
    default: throw new Error("Unknown MCP tool: " + name);
  }
}
function send(value) { process.stdout.write(JSON.stringify(value) + "\n"); }
function respond(id, value) { send({ jsonrpc: "2.0", id, result: value }); }
function fail(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }
async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") throw new Error("Expected a JSON-RPC 2.0 request.");
  if (message.method === "notifications/initialized") return;
  if (message.method === "initialize") return respond(message.id, { protocolVersion: message.params?.protocolVersion || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "uragenow-api", version: "1.0.0" } });
  if (message.method === "ping") return respond(message.id, {});
  if (message.method === "tools/list") return respond(message.id, { tools });
  if (message.method === "tools/call") {
    const value = await call(requireText(message.params?.name, "Tool name"), message.params?.arguments ?? {});
    return respond(message.id, { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
  }
  fail(message.id ?? null, -32601, "Unsupported MCP method: " + message.method);
}
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", line => {
  if (!line.trim()) return;
  let message; try { message = JSON.parse(line); } catch { fail(null, -32700, "Invalid JSON-RPC message."); return; }
  handle(message).catch(error => {
    if (message.id !== undefined) fail(message.id, -32000, error instanceof Error ? error.message : "URageNow MCP request failed.");
    else process.stderr.write((error instanceof Error ? error.message : "URageNow MCP request failed.") + "\n");
  });
});
