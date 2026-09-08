#!/usr/bin/env node
 // CLI companion for Taskitty's Blog Posts UI. Credentials are environment-only.
const fs = require('fs'),
    path = require('path');
const base = (process.env.URAGE_BLOG_API_URL || 'https://your-page.com/api/posts').replace(/\/$/, '');
const user = process.env.URAGE_BLOG_USERNAME,
    password = process.env.URAGE_BLOG_APP_PASSWORD;
const [action, ...args] = process.argv.slice(2);
const fail = m => {
    console.error(`urage-blog: ${m}`);
    process.exit(1)
};
const text = v => v?.startsWith('@') ? fs.readFileSync(path.resolve(process.cwd(), v.slice(1)), 'utf8').replace(/\r?\n$/, '') : v;
async function publish() {
    if (!user || !password) fail('set URAGE_BLOG_USERNAME and URAGE_BLOG_APP_PASSWORD (they are never persisted)');
    if (!args[0] || !args[1]) fail('Usage: publish "title" "markdown" [public|draft|private] [image-url] [ISO-date]');
    const status = args[2] || 'public';
    if (!['public', 'draft', 'private'].includes(status)) fail('status must be public, draft, or private');
    let r;
    try {
        r = await fetch(base, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
            },
            body: JSON.stringify({
                title: text(args[0]),
                content: text(args[1]),
                status,
                image: args[3] || '',
                date: args[4] || new Date().toISOString()
            })
        })
    } catch (e) {
        fail(`API not reachable at ${base}: ${e.message}`)
    }
    const raw = await r.text();
    let out;
    try {
        out = JSON.parse(raw)
    } catch {}
    if (!r.ok) fail(`POST failed: HTTP ${r.status} ${out?.error || out?.message || raw.slice(0, 500)}`);
    if (out?.status && out.status !== status) fail(`server saved ${out.status}, not requested ${status}`);
    console.log(`${status === 'draft' ? 'Draft uploaded' : 'Post published'}${out?.slug ? `: ${out.slug}` : ''}`)
}
if (action === 'publish') publish().catch(e => fail(e.message));
else console.log('URage Blog API CLI\nSet URAGE_BLOG_USERNAME and URAGE_BLOG_APP_PASSWORD. Optional: URAGE_BLOG_API_URL.\nUsage: publish "title" "markdown" [public|draft|private] [image-url] [ISO-date]\nUse @file for title or markdown.');