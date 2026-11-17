# 6. Confine file access to one workspace root

- Status: Accepted
- Date: 2026-11-17
- Context: Agents pass file paths to open_story and save_story, and a wrong or hostile path could read or overwrite files anywhere on the machine.
- Decision: Every file tool resolves paths inside one root directory (`--root`, `EGON_MCP_ROOT` or the working directory) and refuses paths or symlinks that lead outside it.
- Consequences: Users choose the root when they register the server, and stories elsewhere can still come in through import_story as text.
