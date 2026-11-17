# 3. TypeScript on Node with the official MCP SDK over stdio

- Status: Accepted
- Date: 2026-11-17
- Context: Egon is written in TypeScript, and every MCP client we target can start a local server over stdio.
- Decision: The server is a Node ESM package written in TypeScript on `@modelcontextprotocol/sdk` with Zod schemas, and it talks stdio.
- Consequences: Types can mirror Egon's own entities, and clients start the server with a single `node` or `npx` command.
