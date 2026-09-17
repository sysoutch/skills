#!/usr/bin/env node

const defaults = {
  action: "health",
  baseUrl: process.env.URAGE_API_BASE_URL || "http://127.0.0.1:4782",
  token: process.env.URAGE_API_TOKEN || "",
  path: "",
  json: "",
  dashboardRequestId: "",
  jobId: "",
  kind: "",
  limit: "50",
  timeoutMs: "1200000"
};

const argumentMap = new Map([
  ["--action", "action"], ["--base-url", "baseUrl"], ["--token", "token"],
  ["--path", "path"], ["--json", "json"], ["--dashboard-request-id", "dashboardRequestId"],
  ["--job-id", "jobId"], ["--kind", "kind"], ["--limit", "limit"], ["--timeout-ms", "timeoutMs"]
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
} else if (options.action === "get" || options.action === "post-json") {
  if (!options.path.trim().startsWith("/api/")) throw new Error("--path must begin with /api/.");
  target = `${baseUrl}${options.path.trim()}`;
  if (options.action === "post-json") {
    if (!options.json.trim()) throw new Error("--json is required for post-json.");
    JSON.parse(options.json);
    method = "POST";
    headers["content-type"] = "application/json";
  }
} else {
  throw new Error("--action must be health, manifest, jobs, get, or post-json.");
}

const response = await fetch(target, {
  method,
  headers,
  body: method === "POST" ? options.json : undefined,
  signal: AbortSignal.timeout(Number.parseInt(options.timeoutMs, 10) || 1200000)
});
const text = await response.text();
let payload = text;
try { payload = text ? JSON.parse(text) : null; } catch {}
if (!response.ok) {
  console.error(JSON.stringify({status: response.status, error: payload}, null, 2));
  process.exitCode = 1;
} else {
  console.log(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
}