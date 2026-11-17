# 2. Leave egon.io unchanged and integrate through its file format

- Status: Accepted
- Date: 2026-11-17
- Context: Egon imports self-contained `.egn` (JSON) and `.egn.svg` files, and its app already loads a story from `?storyUrl=<url>` when the server sends CORS headers.
- Decision: The MCP server reads and writes Egon's file formats and opens stories in Egon through `storyUrl`, so we change no egon.io source code.
- Consequences: The server works with the public app at `https://egon.io/app/` and any self-hosted copy, and the submodule stays a pinned, read-only reference.
- Alternatives: Adding a live editing API to Egon (postMessage or WebSocket) would allow real-time sync, but it means maintaining a fork and getting changes accepted upstream.
