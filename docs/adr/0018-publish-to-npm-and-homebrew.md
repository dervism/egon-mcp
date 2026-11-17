# 18. Publish to npm and Homebrew

- Status: Accepted
- Date: 2026-11-17
- Context: Using egon-mcp meant cloning the repository with its submodule and building it, and the skill lived only in the repository.
- Decision: egon-mcp is published to npm as `egon-mcp`, built from a clean `dist/` and carrying the README, the license and the skill, and the Homebrew formula in dervism/homebrew-tap installs that npm package and links the skill to `share/egon-mcp/skill`.
- Consequences: People install with `npm install -g egon-mcp`, `npx` or `brew install dervism/tap/egon-mcp` and need the submodule only to build from source; each release bumps `package.json` and `SERVER_VERSION` together, tags the commit, publishes the packed tarball and updates the formula.
