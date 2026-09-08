# URage Blog Publishing

Use this skill whenever work publishes a Blog Post from Taskitty to URageNet or
another endpoint implementing the same post contract.

## One publishing contract

The Taskitty Blog Posts UI (`frontend/src/blog.rs`) and release client
(`.agents/skills/urage-blog/scripts/urage-blog-launcher.cjs`) must remain equivalent:

- `POST` to `URAGE_BLOG_API_URL`.
- HTTP Basic authentication with an application password.
- JSON payload: `title`, `content`, `image`, `date`, `status`.
- Valid statuses: `public`, `draft`, `private`.
- The response status must match the requested status; report a mismatch as an
  error rather than claiming publication succeeded.

Do not change one client without changing or deliberately documenting the
other. Keep field names compatible with URageNet Admin.

## Credentials and safety

- Read credentials only from `URAGE_BLOG_USERNAME` and
  `URAGE_BLOG_APP_PASSWORD` for the CLI. They must never be committed, logged,
  written to a project config, or added to Taskitty Notes.
- The desktop UI keeps credentials only in current reactive memory.
- Use HTTPS endpoints, except explicit `localhost` / `127.0.0.1` development
  endpoints.
- Never use raw shell HTTP calls in instructions; use the release client.

## CLI

```powershell
$env:URAGE_BLOG_USERNAME = "your-user"
$env:URAGE_BLOG_APP_PASSWORD = "your application password"
npm run urage-blog:publish -- "Post title" @post.md draft
```

`@file` is supported for title/content. Optional positional arguments after
status are image URL and ISO publication date.

## Verification

Run `node --check .agents/skills/urage-blog/scripts/urage-blog-launcher.cjs` after changing
the client. A real publish requires user-provided valid credentials and an
authorized endpoint; do not treat a syntax check as a successful publication.
