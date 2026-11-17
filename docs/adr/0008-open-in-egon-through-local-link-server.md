# 8. Open stories in Egon through a local link server

- Status: Accepted
- Date: 2026-11-17
- Context: Egon has no API, but it imports a story from `?storyUrl=` when the server sends `Access-Control-Allow-Origin`.
- Decision: open_in_egon serves the live story from an HTTP server on 127.0.0.1 with a random-token URL and CORS headers, and returns an Egon link to it.
- Consequences: Users see a story in Egon with one click while the MCP server runs, and browsers that block pages from reaching localhost need the saved file and Egon's "Import file" instead.
