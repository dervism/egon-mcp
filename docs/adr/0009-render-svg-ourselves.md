# 9. Render SVG previews ourselves

- Status: Accepted
- Date: 2026-11-17
- Context: Egon draws stories with diagram-js in a browser, which a headless MCP server cannot run cheaply.
- Decision: The server has its own small SVG renderer that follows Egon's look and routes arrows around shapes in the way. Icons go in as data-URL images, so scripts in icons from untrusted files never run.
- Consequences: Agents can produce `.svg` and importable `.egn.svg` files without a browser, and the preview can differ from Egon in small layout details.
