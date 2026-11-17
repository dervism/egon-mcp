# 4. Test-driven development with Vitest

- Status: Accepted
- Date: 2026-11-17
- Context: The server generates files that a separate app must import, so format mistakes only show up later inside Egon.
- Decision: Every feature starts with a failing Vitest test, and Egon's own sample exports serve as fixtures.
- Consequences: The test suite documents the file format. Vitest runs the TypeScript sources directly, and `npm test` builds first so one end-to-end test can start the real server.
