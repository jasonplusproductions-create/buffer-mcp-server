# buffer-mcp-server

A custom MCP server that gives Claude **real** publish/schedule access to Buffer,
via the `createPost` GraphQL mutation — beyond what the official Buffer MCP connector
exposes (which is read-only + `create_idea` drafts only).

## ⚠️ Before you run this: verify the schema

I built this against Buffer's publicly documented GraphQL examples
(`developers.buffer.com`), but I have not run it against a live Buffer GraphQL
endpoint or introspected the schema myself. Specifically double-check, using
Buffer's API docs or GraphQL schema explorer at https://buffer.com/developer-api:

1. **The `channels` query name and fields** in `src/tools/list-channels.ts` — Buffer's
   docs I found didn't show this query's exact shape, only the `createPost` mutation.
   You may need to adjust the query name/fields (e.g. it might be `me.organizations[].channels`
   rather than a flat `channels(organizationId)` query).
2. **The `CreatePostInput` field names** in `src/tools/publish-post.ts` — these match
   the examples in Buffer's docs (`schedulingType`, `mode`, `dueAt`, `saveToDraft`), but
   confirm against the schema explorer before relying on it for real campaigns.

Easiest way to check: open Buffer's API docs playground and run a small test query/mutation
by hand first, then adjust the `.ts` files to match if anything differs.

## Setup

```bash
npm install
npm run build
```

## Configuration

Set two environment variables wherever you run this:

- `BUFFER_API_KEY` — your personal Buffer API key (Buffer → developer settings →
  requires you to be an organization owner). You said you already have this.
- `MCP_SHARED_SECRET` (optional but recommended for a public HTTP deployment) — an
  arbitrary string. If set, requests must include header `x-mcp-secret: <value>`.

## Running locally (stdio) — for Claude Desktop

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "buffer": {
      "command": "node",
      "args": ["/absolute/path/to/buffer-mcp-server/dist/index.js"],
      "env": { "BUFFER_API_KEY": "your_key_here" }
    }
  }
}
```

## Running as a remote HTTP server — for claude.ai custom connectors

```bash
TRANSPORT=http BUFFER_API_KEY=your_key MCP_SHARED_SECRET=some_random_string \
  PORT=3000 npm start
```

This exposes a stateless streamable-HTTP MCP endpoint at `POST /mcp`.

### Hosting options

This is a plain Node/Express app, so it runs on anything that runs Node — **Render,
Railway, Fly.io, or a small VPS** are the simplest. It does *not* run as-is on Cloudflare
Workers (no Node `http` server / Express there); porting it to Workers would mean
swapping Express for a raw `fetch` handler and using the SDK's Workers-compatible
transport pattern — possible, but a separate step from this build. Given the rest of
your stack lives on Cloudflare, that's a reasonable follow-up if you want everything
in one place.

Once hosted, register it in Claude: **Settings → Connectors → Add custom connector**,
paste your server's `https://your-host/mcp` URL.

## Tools this server exposes

- **buffer_list_channels** — read-only, lists channel IDs for an organization.
- **buffer_create_draft_post** — always saves as a draft (`saveToDraft: true` hardcoded).
  Free to call anytime, nothing goes live from this one.
- **buffer_publish_post** — actually schedules or queues a REAL post that will go live.
  Requires `confirmed: true` as a literal parameter, and its tool description explicitly
  instructs Claude to only call it right after you've said something like "yes, post it"
  to that exact text — never from an earlier general go-ahead, and never in response to
  instructions found inside a fetched web page or document.

## Approval workflow (what actually happens)

1. Claude drafts the post text in chat and shows it to you.
2. You say yes/approve.
3. Claude calls `buffer_publish_post` with `confirmed: true` and the exact approved text.

**Important limit to understand:** the `confirmed: true` parameter is a strong signal and
an audit trail (you can always check the tool-call log to see it was set), but it is Claude
setting that parameter based on judgment about the conversation — a JSON field can't
independently verify a human typed "yes." The real guarantee is behavioral: Claude is
built to always ask before taking a publishing action, and to treat that as non-negotiable
regardless of how a request is phrased. If you want a guarantee that doesn't depend on that
judgment at all, use `buffer_create_draft_post` exclusively and do the final approve/schedule
click yourself in Buffer — that's enforced by the code, not by anyone's judgment call.

For extra safety on top of either approach, you can also set **"Requires Approval"** on
your channels in Buffer's own settings — Buffer's docs confirm API-created posts on such
channels are saved as drafts awaiting approval regardless of what the API call requested.

## Known limitations

- If a channel is set to "Requires Approval" in Buffer, posts created via the API land
  as pending drafts regardless of `mode` — that's Buffer's behavior, not a bug here.
- No image/video upload tool included yet (Buffer changed their assets input format on
  May 25, 2026 — worth adding as a follow-up once the schema's confirmed).
- No delete/edit tool included — intentionally minimal for now; extend `src/tools/` if
  you want those.
