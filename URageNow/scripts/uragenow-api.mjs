#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaults = {
  action: "health",
  baseUrl: process.env.URAGE_API_BASE_URL || "http://127.0.0.1:4782",
  token: process.env.URAGE_API_TOKEN || "",
  path: "",
  json: "",
  jsonFile: "",
  dashboardRequestId: "",
  jobId: "",
  kind: "",
  artifactKind: "",
  artifactId: "",
  file: "",
  out: "",
  limit: "50",
  timeoutMs: "1200000",
  sourceFile: "",
  imageFileName: ""
};

const argumentMap = new Map([
  ["--action", "action"], ["--base-url", "baseUrl"], ["--token", "token"],
  ["--path", "path"], ["--json", "json"], ["--json-file", "jsonFile"], ["--dashboard-request-id", "dashboardRequestId"],
  ["--job-id", "jobId"], ["--kind", "kind"], ["--artifact-kind", "artifactKind"],
  ["--artifact-id", "artifactId"], ["--file", "file"], ["--out", "out"], ["--limit", "limit"], ["--timeout-ms", "timeoutMs"], ["--source-file", "sourceFile"], ["--image-file-name", "imageFileName"]
]);
const options = {...defaults};
for (let index = 2; index < process.argv.length; index += 2) {
  const key = argumentMap.get(process.argv[index]);
  const value = process.argv[index + 1];
  if (!key || value === undefined) {
    throw new Error(`Expected a supported --option value pair. Received: ${process.argv.slice(index).join(" ")}`);
  }
  options[key] = value;
}

const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
if (!baseUrl) throw new Error("--base-url is required.");
const headers = {accept: "application/json"};
if (options.token.trim()) headers["x-dashboard-access-token"] = options.token.trim();

const artifactRoutes = {
  image: { path: "/api/generated-image-file", idQuery: "imageId" },
  model3d: { path: "/api/model3d-file", idQuery: "modelId" },
  audio: { path: "/api/generated-audio-file", idQuery: "audioId" },
  video: { path: "/api/generated-video-file", idQuery: "videoId" }
};
let method = "GET";
let target = "";
if (options.action === "health") target = `${baseUrl}/health`;
else if (options.action === "manifest") target = `${baseUrl}/api/llm-tools`;
else if (options.action === "jobs") {
  const query = new URLSearchParams({limit: options.limit});
  if (options.dashboardRequestId.trim()) query.set("requestId", options.dashboardRequestId.trim());
  if (options.jobId.trim()) query.set("jobId", options.jobId.trim());
  if (options.kind.trim()) query.set("kind", options.kind.trim());
  target = `${baseUrl}/api/generation-jobs?${query}`;
} else if (options.action === "artifact") {
  if (!artifactRoutes[options.artifactKind] && options.artifactKind !== "music") throw new Error("--artifact-kind must be image, model3d, audio, music, or video.");
  if (!options.artifactId.trim()) throw new Error("--artifact-id is required for artifact.");
  target = `${baseUrl}/api/generated-artifact?${new URLSearchParams({kind: options.artifactKind, id: options.artifactId.trim()})}`;
} else if (options.action === "import-image-file") {
  if (!options.sourceFile.trim()) throw new Error("--source-file is required for import-image-file.");
  const sourcePath = path.resolve(options.sourceFile);
  let imageBytes;
  try {
    imageBytes = await readFile(sourcePath);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`--source-file was not found: ${sourcePath}`);
    throw error;
  }
  const mimeTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff" };
  const extension = path.extname(sourcePath).toLowerCase();
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error("--source-file must use a supported image extension (.png, .jpg, .jpeg, .gif, .webp, .avif, .bmp, .tif, or .tiff).");
  target = `${baseUrl}/api/image-import`;
  options.json = JSON.stringify({
    dataUrl: `data:${mimeType};base64,${imageBytes.toString("base64")}`,
    fileName: options.imageFileName.trim() || path.basename(sourcePath)
  });
  method = "POST";
  headers["content-type"] = "application/json";
} else if (options.action === "get" || options.action === "post-json") {
  if (!options.path.trim().startsWith("/api/")) throw new Error("--path must begin with /api/.");
  target = `${baseUrl}${options.path.trim()}`;
  if (options.action === "post-json") {
    if (Boolean(options.json.trim()) === Boolean(options.jsonFile.trim())) {
      throw new Error("Specify exactly one of --json or --json-file for post-json.");
    }
    if (options.jsonFile.trim()) {
      const jsonFilePath = path.resolve(options.jsonFile);
      try {
        options.json = await readFile(jsonFilePath, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") throw new Error(`--json-file was not found: ${jsonFilePath}`);
        throw error;
      }
    }
    JSON.parse(options.json);
    method = "POST";
    headers["content-type"] = "application/json";
  }
} else if (options.action === "download") {
  const route = artifactRoutes[options.artifactKind];
  if (!route) throw new Error("--artifact-kind must be image, model3d, audio, or video.");
  if (!options.artifactId.trim() || !options.file.trim() || !options.out.trim()) {
    throw new Error("--artifact-id, --file, and --out are required for download.");
  }
  const query = new URLSearchParams({ [route.idQuery]: options.artifactId.trim(), file: options.file.trim() });
  target = `${baseUrl}${route.path}?${query}`;
} else {
  throw new Error("--action must be health, manifest, jobs, artifact, get, post-json, import-image-file, or download.");
}

const response = await fetch(target, {
  method,
  headers,
  body: method === "POST" ? options.json : undefined,
  signal: AbortSignal.timeout(Number.parseInt(options.timeoutMs, 10) || 1200000)
});
if (options.action === "download" && response.ok) {
  const outputPath = path.resolve(options.out);
  try {
    await access(outputPath);
    throw new Error(`Refusing to overwrite existing file: ${outputPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes, { flag: "wx" });
  console.log(JSON.stringify({ path: outputPath, bytes: bytes.length, contentType: response.headers.get("content-type") }, null, 2));
  process.exit(0);
}
const text = await response.text();
let payload = text;
try { payload = text ? JSON.parse(text) : null; } catch {}
if (!response.ok) {
  console.error(JSON.stringify({status: response.status, error: payload}, null, 2));
  process.exitCode = 1;
} else {
  console.log(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
}