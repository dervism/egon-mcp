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
| `npm pack`, `npm publish` | Build first, then copy the repository README (links pointed at GitHub), `LICENSE` and the skill into this folder, gitignored, so the package carries them. |

Three tests run the built code in `dist/` in a separate process, which `npm test` builds first: the stdio end-to-end test in `test/stdio.e2e.test.ts`, the named pipe test in `src/server/workspace.test.ts`, so a blocked read cannot hang the run, and the icon data test under Node's permission model in `src/icons/catalog.test.ts`. Without a complete build they fail with a hint, and they are skipped when `dist/` was not built from the current sources, for example in `npm run test:watch` after an edit. For that check the build records a hash of its inputs (sources, generated icons, `package.json`, both tsconfig files and the installed TypeScript compiler's package file) in `dist/build-info.json`, written only once tsc and the asset copy have succeeded.

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
| `src/build-info.ts` | Hashes the build inputs, copies the asset folders into `dist/`, writes the build record in `dist/build-info.json`, and holds the icon file check that the generator, the build and the server share. Node loads it without tsc too. |

Tests sit next to the code (`*.test.ts`), plus `test/` for end-to-end and skill tests. Egon's own sample exports in the submodule serve as fixtures.

## Working rules

- Write the failing test first, then the code ([ADR 4](../docs/adr/0004-test-driven-with-vitest.md)).
- Check format questions against the Egon source in `modules/egon.io`, and against the released version (`git -C ../modules/egon.io show v3.2.1:<path>`) when the public app is involved.
- Changing a tool means running `npm run docs` and updating the skill in the same commit.
- Ask the `independent-reviewer` agent to review a change range before pushing.

## Releasing

1. Set the version in `package.json` (`npm version <x.y.z> --no-git-tag-version`) and `SERVER_VERSION` in `src/server/server.ts`; a test checks that they match.
2. Run `npm test`, commit, tag `v<x.y.z>` and push the commit and the tag (`git push origin main v<x.y.z>`). The README on npm links to files at that tag.
3. Run `npm pack`, which builds from a clean `dist/`, check the file list, then `npm publish egon-mcp-<x.y.z>.tgz`.
4. Point the formula in [dervism/homebrew-tap](https://github.com/dervism/homebrew-tap) at the new tarball on the npm registry, with its SHA-256. The formula links the package's `skill` folder to `share/egon-mcp/skill`, the path the README gives for Homebrew installs.
