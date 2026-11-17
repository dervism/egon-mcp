# 12. Review changes with an independent agent

- Status: Accepted
- Date: 2026-11-17
- Context: The code is written test first by an AI agent, and a reviewer that shares its conversation tends to repeat its assumptions.
- Decision: `.claude/agents/independent-reviewer.md` defines a reviewer on Opus at extra high effort that only sees the repository and the change range it is given.
- Consequences: Reviews catch what the author's context hides, at the cost of a separate, slower run per review.
