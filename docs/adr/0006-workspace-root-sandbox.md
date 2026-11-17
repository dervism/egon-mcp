# 6. Confine file access to one workspace root

- Status: Accepted, amended by [ADR 15](0015-file-ownership-and-layout-per-story.md)
- Date: 2026-11-17
- Context: Agents pass file paths to open_story and save_story, and a wrong or hostile path could read or overwrite files anywhere on the machine.
- Decision: Every file tool resolves paths inside one root directory (`--root`, `EGON_MCP_ROOT` or the working directory, never the file system root) and refuses paths or symlinks that lead outside it. Saving replaces an existing file only as ADR 15 describes, or with `overwrite`.
- Consequences: Users choose the root when they register the server, and stories elsewhere can still come in through import_story as text.
