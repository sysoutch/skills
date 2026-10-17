# URage Blog Publishing

## Skill location

For users who have it installed, `%USERPROFILE%\.agents\skills\urage-blog` is the source of truth. Use that global folder for skill scripts and references to avoid ambiguity with a repository mirror. The checked-in `.agents\skills\urage-blog` copy is a compatibility mirror; use it only when the global skill is unavailable, and keep both copies synchronized when this skill changes.

## Project context

An absolute helper path does not change the process working directory. Invoke the global launcher from the target project root so `@file` title or Markdown arguments resolve there. To use files from another project, change location explicitly (for example, `Push-Location C:\Path\To\Project` before the command and `Pop-Location` afterward) or pass an absolute file path.

Use this skill whenever work publishes a Blog Post from Taskitty to URageNet or
another endpoint implementing the same post contract, or lists existing posts.

## One publishing contract

The Taskitty Blog Posts UI (`frontend/src/blog.rs`) and release client
(`%USERPROFILE%/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs`) must remain equivalent:

- `POST` to `URAGE_BLOG_API_URL`.
- HTTP Basic authentication with an application password.
- JSON payload: `title`, `content`, `image`, `date`, `status`.
- Valid statuses: `public`, `draft`, `private`.
- The response status must match the requested status; report a mismatch as an
  error rather than claiming publication succeeded.
- `GET` on `URAGE_BLOG_API_URL` lists existing posts. Both clients parse the
  body defensively — a bare JSON array or an object wrapping it under
  `posts`/`data` — and show title, status, date (first 10 chars), and slug per
  post; missing fields degrade to empty instead of failing the fetch.

Do not change one client without changing or deliberately documenting the
other. Keep field names compatible with URageNet Admin.

## Editing existing posts (launcher only)

Taskitty's loopback API proxies create and list only. The launcher's `post`, `update`,
`trash`, `restore` and `upload-image` actions (MCP: `blog_post_get`, `blog_update`,
`blog_trash`, `blog_restore`, `blog_upload_image`) talk to the saved endpoint directly,
using URageNet's existing routes:

- `GET <endpoint>/:slug` reads a post (drafts too, with the saved credentials).
- `POST <endpoint>/:id` updates it. URageNet replaces every field on update, so `update`
  fetches the post first and changes only the given fields; the slug (URL) stays. It reads
  the post back and reports anything the server did not store.
- `DELETE <endpoint>/:slug` moves a post to the bin (soft delete, set to draft);
  `POST <endpoint>/:slug/restore` brings it back. There is no permanent delete here.
- `POST <api>/upload` (field `image`) stores an image under `/media/images/` and returns its URL.

They load the saved connection from Taskitty's loopback-only `/v1/blog/credentials` route
inside the launcher process; the application password is never printed, logged or returned,
and only HTTPS (or localhost) endpoints receive it. The Taskitty Blog Posts UI has no
editing yet; this is a deliberate launcher-only extension of the contract.

Edit a post with `update` instead of publishing a second copy. Post content is Markdown;
URageNet renders it with marked and sanitizes it (`/libs/content-security.js`): only plain
tags (`div`, `p`, `h1`-`h6`, `a`, `img`, `i`, `span`, tables, lists...) and the attributes
`href`, `src`, `alt`, `title`, `class`, `width`, `height`, `target`, `rel` survive. Inline
`style` and `<svg>` are removed; style with the site's classes (`card`) and Bootstrap Icons
(`<i class="bi bi-download"></i>`).

## Credentials and safety

- Primary mode reuses the credentials Taskitty already saved. The Blog Posts
  studio stores the endpoint in `blog-connection.json` and the application
  password in the OS vault. The launcher's `health`/`status`/`posts`/`publish`/
  `endpoint` actions read that saved state through Taskitty's loopback API, so an
  agent never handles or passes an application password.
- CI/offline direct mode (the `publish-direct` and `list` actions) reads
  `URAGE_BLOG_USERNAME` and `URAGE_BLOG_APP_PASSWORD`. They must never be
  committed, logged, written to a project config, or added to Taskitty Notes.
- The desktop UI keeps credentials only in the vault, never in reactive memory or
  Notes.
- Use HTTPS endpoints, except explicit `localhost` / `127.0.0.1` development
  endpoints.
- Never use raw shell HTTP calls in instructions; use the release client.

## CLI

Saved Taskitty credentials — no secret is passed in (the launcher authenticates
to Taskitty's loopback API and loads the vault record itself):

```powershell
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" status
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" posts
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" publish --title "Post title" --content-file post.md --status draft
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" post --slug my-post
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" update --slug my-post --content-file post.md --dry-run
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" update --slug my-post --status public
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" trash --slug my-post
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" upload-image --file screenshot.png
```

Set `TASKITTY_API_BASE` to the project's `apiBaseUrl` from `taskitty.json` when Taskitty's
API is not on the default port (the MCP does this automatically).

CI/offline direct mode — credentials come from the environment:

```powershell
$env:URAGE_BLOG_USERNAME = "your-user"
$env:URAGE_BLOG_APP_PASSWORD = "your application password"
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" list
node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs" publish-direct --title "Post title" --content-file post.md --status draft
```

`--content-file` reads Markdown from the current working directory; `--dry-run`
validates a publish without sending. `list` GETs `URAGE_BLOG_API_URL` and prints
one line per existing post (title, status, date, slug).

## Verification

Run `node --check "$env:USERPROFILE/.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs"` after changing
the client. After changing the `list` parsing, run
`node "$env:USERPROFILE/.agents/skills/urage-blog/scripts/mock-list-test.cjs"` — it spins up a local HTTP
stub and exercises every response shape (bare array, `{posts}`, `{data}`, empty list,
401 error, missing credentials) against the real launcher. A real publish requires
user-provided valid credentials and an authorized endpoint; do not treat a syntax check
as a successful publication.
