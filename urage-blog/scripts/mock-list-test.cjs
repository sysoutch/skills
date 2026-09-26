// Verification for the urage-blog `list` action (task 145).
// Spins up a local HTTP stub and runs the real launcher against it, covering
// every response shape both clients must parse identically (see SKILL.md):
// bare array, {posts}, {data} with title falling back to slug, empty list,
// 401 error path, and missing credentials.
// NOTE: children must be spawned asynchronously — execFileSync blocks this
// process's event loop, so the in-process mock server could never answer the
// child (that deadlock produced earlier ETIMEDOUT failures; the launcher
// itself was fine).
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const LAUNCHER = path.join(__dirname, 'urage-blog-launcher.cjs');

let port;
const routes = {
    '/bare': [
        { title: 'Hello World', slug: 'hello-world', status: 'public', date: '2026-09-14T19:54:10.000Z' },
        { title: 'Second Post', slug: 'second-post', status: 'draft', date: '2026-09-20T08:00:00.000Z' }
    ],
    '/wrapped': { posts: [{ title: 'Wrapped One', slug: 'wrapped-one', status: 'private', date: '2026-01-02T03:04:05.000Z' }] },
    '/datawrap': { data: [{ slug: 'no-title-slug', status: 'public', date: '2026-02-03T04:05:06.000Z' }] },
    '/empty': [],
    '/err': null // 401 JSON error
};

const server = http.createServer((req, res) => {
    const headers = { 'Content-Type': 'application/json', Connection: 'close' };
    const auth = req.headers.authorization || '';
    if (auth !== 'Basic ' + Buffer.from('user:pass').toString('base64')) {
        res.writeHead(401, headers);
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
    const body = routes[req.url];
    if (body === null) {
        res.writeHead(401, headers);
        res.end(JSON.stringify({ error: 'Bad credentials' }));
        return;
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify(body));
});

const run = (path, password) => new Promise((resolve) => {
    const child = spawn(process.execPath, [LAUNCHER, 'list'], {
        env: { ...process.env, URAGE_BLOG_API_URL: `http://127.0.0.1:${port}${path}`, URAGE_BLOG_USERNAME: 'user', URAGE_BLOG_APP_PASSWORD: password },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ ok: false, err: 'test-side 15s timeout' }); }, 15000);
    child.stdout.on('data', d => { out += String(d); });
    child.stderr.on('data', d => { err += String(d); });
    child.on('exit', (code) => { clearTimeout(timer); resolve({ ok: code === 0, out: out.trim(), err: err.trim() }); });
});

server.listen(0, '127.0.0.1', async () => {
    port = server.address().port;
    const cases = [
        ['bare array', '/bare', 'Hello World [public] 2026-09-14 (hello-world)\nSecond Post [draft] 2026-09-20 (second-post)'],
        ['wrapped {posts}', '/wrapped', 'Wrapped One [private] 2026-01-02 (wrapped-one)'],
        ['wrapped {data}, title falls back to slug', '/datawrap', 'no-title-slug [public] 2026-02-03'],
        ['empty list', '/empty', 'No posts at http://127.0.0.1:' + port + '/empty']
    ];
    let failed = 0;
    for (const [name, path, expected] of cases) {
        const r = await run(path, 'pass');
        // Exact match: the CLI line format must stay equivalent to the frontend
        // parser's row metadata (see SKILL.md), so any extra/missing field fails.
        if (!r.ok || r.out !== expected) {
            failed++;
            console.log(`FAIL ${name}: ${JSON.stringify(r)}`);
        } else {
            console.log(`PASS ${name}`);
        }
    }
    // Error path: auth OK but the endpoint answers 401 with a JSON error.
    {
        const r = await run('/err', 'pass');
        if (r.ok || !/GET failed: HTTP 401 Bad credentials/.test(r.err)) { failed++; console.log(`FAIL 401 error path: ${JSON.stringify(r)}`); }
        else console.log('PASS 401 error path');
    }
    // Missing credentials -> usage failure before any request.
    {
        const child = spawn(process.execPath, [LAUNCHER, 'list'], {
            env: { ...process.env, URAGE_BLOG_API_URL: `http://127.0.0.1:${port}/bare` },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let err = '';
        const code = await new Promise((resolve) => {
            child.stderr.on('data', d => { err += String(d); });
            child.on('exit', resolve);
        });
        if (code === 0 || !/set URAGE_BLOG_USERNAME and URAGE_BLOG_APP_PASSWORD/.test(err)) { failed++; console.log(`FAIL missing-credentials path: ${err}`); }
        else console.log('PASS missing-credentials path');
    }
    server.close();
    console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`);
    process.exit(failed === 0 ? 0 : 1);
});
