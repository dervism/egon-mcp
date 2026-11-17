# 11. Keep the agent skill in this repository

- Status: Accepted
- Date: 2026-11-17
- Context: Agents use the server better with guidance on Domain Storytelling and on which tool to call when, and that guidance must change together with the tools.
- Decision: The skill lives in `skills/egon-mcp-skill` and ships with the server, and the project's `.claude/skills` links to it.
- Consequences: Tool changes and skill changes land in the same commit, and the independent reviewer checks that they match.
