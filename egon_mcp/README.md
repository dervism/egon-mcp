# egon_mcp

The egon-mcp server: Node, TypeScript, the official MCP SDK over stdio, tested with Vitest. Setup and client configuration are in the [repository README](../README.md).

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Builds (which extracts Egon's icons from the submodule), then runs all tests. |
| `npm run typecheck` | Type checks sources and tests. |
| `npm run build` | Builds `dist/`; `node dist/index.js --help` lists the options. |
| `npm run docs` | Builds, then regenerates the skill's [tool reference](../skills/egon-mcp-skill/references/tools.md) from the server. A test fails when the reference is out of date. |
| `npm run generate:icons` | Writes `src/icons/generated/builtin-icons.json` (gitignored) from `modules/egon.io`. |

Two tests run the built code in `dist/`, which `npm test` builds first: the stdio end-to-end test in `test/stdio.e2e.test.ts`, and the named pipe test in `src/server/workspace.test.ts`, which needs a separate process so a blocked read cannot hang the run. Running Vitest directly without a build makes them fail with a hint, and the pipe test is skipped when `dist/` was not built from the current sources, for example in `npm run test:watch` after an edit. The build records a hash of the sources in `dist/build-info.json` for that check.

## Code map

| Folder | Content |
|---|---|
| `src/egon` | Egon's file format: types, parser for every `.egn` / `.dst` / `.svg` layout, serializer for the Egon 3 and Egon 4 layouts. |
| `src/icons` | Icon extraction from the submodule and the searchable icon catalog. |
| `src/story` | The editable `Story`, sentence builder, narration, validation, auto-layout and arrow routing. |
| `src/render` | Standalone SVG renderer that follows Egon's look. |
| `src/server` | MCP tools, resources and prompts, the workspace sandbox, and the local link server for `open_in_egon`. |
| `src/docs` | Generator for the skill's tool reference. |
| `src/cli.ts`, `src/index.ts` | Command line options and the stdio entry point. |
| `src/build-info.ts` | Hash of the sources, which the build records in `dist/build-info.json`. |

Tests sit next to the code (`*.test.ts`), plus `test/` for end-to-end and skill tests. Egon's own sample exports in the submodule serve as fixtures.

## Working rules

- Write the failing test first, then the code ([ADR 4](../docs/adr/0004-test-driven-with-vitest.md)).
- Check format questions against the Egon source in `modules/egon.io`, and against the released version (`git -C ../modules/egon.io show v3.2.1:<path>`) when the public app is involved.
- Changing a tool means running `npm run docs` and updating the skill in the same commit.
- Ask the `independent-reviewer` agent to review a change range before pushing.
