# Architecture decision records

Each file records one decision for egon-mcp. Fields hold one line each, two sentences at most.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-leave-egon-io-unchanged.md) | Leave egon.io unchanged and integrate through its file format | Accepted |
| [0003](0003-typescript-node-mcp-sdk.md) | TypeScript on Node with the official MCP SDK over stdio | Accepted |
| [0004](0004-test-driven-with-vitest.md) | Test-driven development with Vitest | Accepted |
| [0005](0005-generate-icons-from-submodule.md) | Generate built-in icon data from the egon.io submodule | Accepted, amended by 0014 |
| [0006](0006-workspace-root-sandbox.md) | Confine file access to one workspace root | Accepted, amended by 0015 |
| [0007](0007-write-egon-3-file-layout.md) | Write the Egon 3 file layout by default | Accepted, amended by 0015 |
| [0008](0008-open-in-egon-through-local-link-server.md) | Open stories in Egon through a local link server | Accepted |
| [0009](0009-render-svg-ourselves.md) | Render SVG previews ourselves | Accepted |
| [0010](0010-sentence-level-tools.md) | Offer sentence-level tools next to element-level tools | Accepted, amended by 0013 |
| [0011](0011-skill-lives-in-repo.md) | Keep the agent skill in this repository | Accepted |
| [0012](0012-independent-reviewer-agent.md) | Review changes with an independent agent | Accepted |
| [0013](0013-new-work-object-per-sentence.md) | Draw a new work object for each sentence | Accepted |
| [0014](0014-license-gpl-3-or-later.md) | License egon-mcp under GPL-3.0-or-later | Accepted |
| [0015](0015-file-ownership-and-layout-per-story.md) | Track file ownership and layout per story | Accepted |
