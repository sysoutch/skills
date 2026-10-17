#!/usr/bin/env node
// urage-blog launcher: the vault record is the credential source.
//
// The Blog Posts studio saves its endpoint (blog-connection.json) and its
// application password (the OS vault) inside the desktop app. Every action below reads
// that saved state through the local API, so an agent never has to handle
// an application password. The direct URageNet mode (env vars) stays for CI.

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const process = require('process');
const { Buffer } = require('buffer');

// The desktop app keeps its API token beside the workspace registry in the app data
// directory; mirror the platform-specific location so the launcher can
// authenticate without the caller ever passing a secret.
function taskittyDataDir() {
  if (process.env.TASKITTY_DATA_DIR) return process.env.TASKITTY_DATA_DIR;
  if (process.env.APPDATA) return path.join(process.env.APPDATA, 'taskitty');
  if (os.platform() === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'taskitty');
  return path.join(os.homedir(), '.local', 'share', 'taskitty');
}

// One authenticated call to the loopback API, printed as JSON. The blog
// routes load the vault record themselves, so nothing secret is passed here.
function taskittyApiRequest(pathname, method, payload) {
  const base = process.env.TASKITTY_API_BASE || 'http://127.0.0.1:8723';
  const token = process.env.TASKITTY_API_TOKEN || (() => {
    const file = path.join(taskittyDataDir(), 'api-token');
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8').trim();
  })();
  if (!token) {
    throw new Error('Taskitty API token not found. Start the Taskitty desktop app (its automation API) or set TASKITTY_API_TOKEN.');
  }
  const target = new URL(`${base}${pathname}`);
  const transport = target.protocol === 'https:' ? https : http;
  transport.request({
    method,
    hostname: target.hostname,
    port: target.port,
    path: target.pathname,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  }).on('response', (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => {
      const parsed = JSON.parse(body);
      if (response.statusCode >= 400) {
        const message = parsed.error || parsed.message || 'Taskitty rejected the request.';
        console.error(`Taskitty API ${response.statusCode}: ${message}`);
        process.exit(1);
      }
      console.log(JSON.stringify(parsed, null, 2));
    });
  }).on('error', (error) => {
    console.error(`Taskitty API request failed: ${error.message}`);
    process.exit(1);
  }).end(payload === undefined || payload === null ? '' : JSON.stringify(payload));
}


// Direct URageNet mode for CI: credentials come from the environment because
// there is no desktop vault on a build server.
async function directPublish() {
  const endpoint = process.env.URAGE_BLOG_ENDPOINT || 'https://urage.net/api/posts';
  const username = process.env.URAGE_BLOG_USERNAME;
  const password = process.env.URAGE_BLOG_APP_PASSWORD;
  if (!username || !password) {
    throw new Error('Direct mode needs UAGE_BLOG_USERNAME and UAGE_BLOG_APP_PASSWORD; use publish (saved credentials) instead.');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: flags.title || '',
      content: flags.content || (flags['content-file'] ? fs.readFileSync(flags['content-file'], 'utf8') : ''),
      image: flags.image || '',
      date: flags.date || new Date().toISOString(),
      status: flags.status || 'public',
    }),
  });
  const text = await response.text();
  console.log(JSON.stringify({ ok: response.ok, status: response.status, body: text }, null, 2));
  if (!response.ok) process.exit(1);
}

// Direct URageNet listing for CI/offline tests: credentials come from the
// environment because there is no desktop vault on a build server.
// Parses the same defensive shapes the Blog Posts studio accepts (bare array,
// {posts}, {data}) and prints one line per post (title, status, date, slug).
async function directList() {
  const url = process.env.URAGE_BLOG_API_URL || 'https://urage.net/api/posts';
  const username = process.env.URAGE_BLOG_USERNAME;
  const password = process.env.URAGE_BLOG_APP_PASSWORD;
  if (!username || !password) {
    throw new Error('set URAGE_BLOG_USERNAME and URAGE_BLOG_APP_PASSWORD to list posts in direct mode');
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`, 'content-type': 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = '';
    try { const parsed = JSON.parse(text); detail = parsed.error || parsed.message || ''; } catch (ignored) {}
    throw new Error(`GET failed: HTTP ${response.status} ${detail}`.trim());
  }
  const parsed = JSON.parse(text);
  let posts;
  if (Array.isArray(parsed)) posts = parsed;
  else if (Array.isArray(parsed.posts)) posts = parsed.posts;
  else if (Array.isArray(parsed.data)) posts = parsed.data;
  else posts = [];
  if (posts.length === 0) { console.log(`No posts at ${url}`); return; }
  const lines = posts.map((post) => {
    const title = post.title || post.slug || '';
    const status = post.status || '';
    const dateShort = (post.date || '').slice(0, 10);
    const suffix = post.title && post.slug ? ` (${post.slug})` : '';
    return `${title} [${status}] ${dateShort}${suffix}`.trim();
  });
  console.log(lines.join('\n'));
}

// --- Editing existing posts -------------------------------------------------------------
// Taskitty's loopback API proxies create and list only. Reading, editing, trashing and image
// uploads talk to the saved endpoint directly, with the saved connection loaded from
// Taskitty's loopback-only /v1/blog/credentials route. The application password stays inside
// this process: it is never printed, logged or returned (errors carry only the HTTP status).

function taskittyApiJson(pathname, method, payload) {
  const base = process.env.TASKITTY_API_BASE || 'http://127.0.0.1:8723';
  const token = process.env.TASKITTY_API_TOKEN || (() => {
    const file = path.join(taskittyDataDir(), 'api-token');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
  })();
  if (!token) return Promise.reject(new Error('Taskitty API token not found. Start the Taskitty desktop app (its automation API) or set TASKITTY_API_TOKEN.'));
  const target = new URL(`${base}${pathname}`);
  const transport = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    transport.request({
      method, hostname: target.hostname, port: target.port, path: target.pathname,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    }).on('response', (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body); } catch (ignored) {}
        if (response.statusCode >= 400) reject(new Error(`Taskitty API ${response.statusCode}: ${parsed.error || parsed.message || 'request rejected'}`));
        else resolve(parsed);
      });
    }).on('error', (error) => reject(new Error(`Taskitty API request failed: ${error.message}`)))
      .end(payload === undefined || payload === null ? '' : JSON.stringify(payload));
  });
}

async function savedConnection() {
  const record = await taskittyApiJson('/v1/blog/credentials', 'GET', null);
  if (!record.endpoint || !record.username || !record.applicationPassword) {
    throw new Error('Taskitty has no complete saved blog connection; save it in the Blog Posts studio first.');
  }
  const endpoint = String(record.endpoint).replace(/\/+$/, '');
  if (!/^https:\/\//i.test(endpoint) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(endpoint)) {
    throw new Error(`Refusing to send credentials to a non-HTTPS endpoint: ${endpoint}`);
  }
  return { endpoint, authorization: `Basic ${Buffer.from(`${record.username}:${record.applicationPassword}`).toString('base64')}` };
}

async function endpointRequest(connection, url, method, body) {
  const options = { method, headers: { authorization: connection.authorization } };
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) { options.headers['content-type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch(url, options);
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (ignored) {}
  if (!response.ok) {
    const detail = parsed && (parsed.error || parsed.message) ? `: ${parsed.error || parsed.message}` : '';
    throw new Error(`${method} ${url} failed (HTTP ${response.status})${detail}`);
  }
  return parsed;
}

function requireSlug() {
  const slug = typeof flags.slug === 'string' ? flags.slug.trim() : '';
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error('this action needs --slug <post-slug> (see the posts action)');
  return slug;
}

async function fetchPost(connection, slug) {
  const post = await endpointRequest(connection, `${connection.endpoint}/${encodeURIComponent(slug)}`, 'GET');
  if (!post || !post.id) throw new Error(`post ${slug} not found`);
  return post;
}

async function getPost() {
  const connection = await savedConnection();
  const post = await fetchPost(connection, requireSlug());
  const { id, slug, title, status, date, image, content } = post;
  console.log(JSON.stringify({ id, slug, title, status, date, image, content }, null, 2));
}

// Edits a post in place: only the fields given change, everything else (and the slug, so the
// URL) stays. URageNet replaces all fields on update, so the current post is fetched first.
async function updatePost() {
  const connection = await savedConnection();
  const slug = requireSlug();
  const current = await fetchPost(connection, slug);
  const next = {
    title: typeof flags.title === 'string' ? flags.title : current.title,
    content: typeof flags.content === 'string' ? flags.content : (flags['content-file'] ? fs.readFileSync(flags['content-file'], 'utf8') : current.content),
    image: typeof flags.image === 'string' ? flags.image : (current.image || ''),
    date: typeof flags.date === 'string' ? flags.date : current.date,
    status: typeof flags.status === 'string' ? flags.status : current.status,
  };
  if (!['public', 'draft', 'private'].includes(next.status)) throw new Error('status must be public, draft or private');
  if (!String(next.title).trim() || !String(next.content).trim()) throw new Error('title and content must not be empty');
  const changed = Object.keys(next).filter((key) => String(next[key] ?? '') !== String(current[key] ?? ''));
  const summary = { id: current.id, slug, changed, status: next.status, contentLength: { before: String(current.content || '').length, after: String(next.content).length } };
  if (flags['dry-run'] === true || changed.length === 0) {
    console.log(JSON.stringify({ ...summary, dryRun: flags['dry-run'] === true, note: changed.length ? undefined : 'nothing to change' }, null, 2));
    return;
  }
  await endpointRequest(connection, `${connection.endpoint}/${current.id}`, 'POST', next);
  // Read it back: report a server that did not store what was sent rather than claiming success.
  const stored = await fetchPost(connection, slug);
  const mismatched = ['title', 'status'].filter((key) => String(stored[key]) !== String(next[key]));
  if (String(stored.content).trim() !== String(next.content).trim()) mismatched.push('content');
  if (mismatched.length) throw new Error(`the server did not store: ${mismatched.join(', ')}`);
  console.log(JSON.stringify({ ...summary, updated: true }, null, 2));
}

// Moves a post to URageNet's bin (soft delete, set to draft); restore brings it back.
async function trashPost() {
  const connection = await savedConnection();
  const slug = requireSlug();
  await fetchPost(connection, slug);
  await endpointRequest(connection, `${connection.endpoint}/${encodeURIComponent(slug)}`, 'DELETE');
  console.log(JSON.stringify({ slug, trashed: true, restore: `restore --slug ${slug}` }, null, 2));
}

async function restorePost() {
  const connection = await savedConnection();
  const slug = requireSlug();
  await endpointRequest(connection, `${connection.endpoint}/${encodeURIComponent(slug)}/restore`, 'POST');
  console.log(JSON.stringify({ slug, restored: true }, null, 2));
}

// Uploads an image to the site's media folder (POST <api>/upload) and prints its absolute URL,
// for a post's image field or for <img> tags in its content.
async function uploadImage() {
  const file = typeof flags.file === 'string' ? flags.file : '';
  if (!file || !fs.existsSync(file)) throw new Error('upload-image needs --file <path to an image>');
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
  const type = types[path.extname(file).toLowerCase()];
  if (!type) throw new Error('upload-image accepts .png, .jpg, .jpeg, .gif and .webp');
  const connection = await savedConnection();
  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(file)], { type }), path.basename(file));
  const uploadUrl = connection.endpoint.replace(/\/posts$/, '/upload');
  const result = await endpointRequest(connection, uploadUrl, 'POST', form);
  const url = result && result.url ? new URL(result.url, connection.endpoint).href : '';
  console.log(JSON.stringify({ file: path.basename(file), url }, null, 2));
}

function usage() {
  console.log(`Usage: node urage-blog-launcher.cjs <action> [flags]

Actions (saved Taskitty credentials — no secret is ever passed in):
  health                       check the Taskitty desktop API is reachable
  status                       show the saved blog endpoint and whether the vault holds credentials
  posts                        list posts already on the saved endpoint
  publish --title T --content C [--content-file F] [--image U] [--date D] [--status public|draft|private] [--dry-run]
                               publish with the credentials Taskitty already saved (--dry-run validates only)
  endpoint --endpoint URL      point the Blog Posts studio at a different endpoint
  post --slug S                show one post with its content
  update --slug S [--title T] [--content C | --content-file F] [--image U] [--date D] [--status S] [--dry-run]
                               edit a post in place: only the given fields change, the slug (URL) stays
  trash --slug S               move a post to the bin (soft delete; restore brings it back)
  restore --slug S             restore a post from the bin
  upload-image --file F        upload an image to the site's media and print its URL

Legacy direct mode (CI only, reads UAGE_BLOG_ENDPOINT/USERNAME/APP_PASSWORD):
  publish-direct --title T --content C [--image U] [--date D] [--status S]
  list                         list posts on URAGE_BLOG_API_URL using URAGE_BLOG_USERNAME/APP_PASSWORD (CI/offline)`);
}

const argv = process.argv.slice(2);
const action = argv[0];
const flags = {};
for (let index = 1; index < argv.length; index += 1) {
  const flag = argv[index];
  if (!flag.startsWith('--')) continue;
  const key = flag.slice(2);
  const next = argv[index + 1];
  if (next && !next.startsWith('--')) { flags[key] = next; index += 1; } else flags[key] = true;
}

async function main() {
  if (!action || action === 'help' || flags.help) usage();
  else if (action === 'health') taskittyApiRequest('/v1/health', 'GET', null);
  else if (action === 'status') taskittyApiRequest('/v1/blog/status', 'GET', null);
  else if (action === 'posts') taskittyApiRequest('/v1/blog/posts/list', 'GET', null);
  else if (action === 'endpoint') {
    if (!flags.endpoint) throw new Error('endpoint action needs --endpoint URL');
    taskittyApiRequest('/v1/blog/endpoint', 'POST', { endpoint: flags.endpoint });
  } else if (action === 'publish') {
    if (!flags.title) throw new Error('publish action needs --title');
    if (!flags.content && !flags['content-file']) throw new Error('publish action needs --content or --content-file');
    taskittyApiRequest('/v1/blog/posts', 'POST', {
      title: flags.title,
      content: flags.content || fs.readFileSync(flags['content-file'], 'utf8'),
      image: flags.image || '',
      date: flags.date || '',
      status: flags.status || 'public',
      dry_run: flags['dry-run'] === true,
    });
  } else if (action === 'post') await getPost();
  else if (action === 'update') await updatePost();
  else if (action === 'trash') await trashPost();
  else if (action === 'restore') await restorePost();
  else if (action === 'upload-image') await uploadImage();
  else if (action === 'publish-direct') await directPublish();
  else if (action === 'list') await directList();
  else throw new Error(`unknown action ${action}`);
}

main().catch((error) => {
  console.error(String(error.message || error));
  process.exit(1);
});
