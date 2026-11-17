# 15. Track file ownership per story and layout per file

- Status: Accepted
- Date: 2026-11-17
- Context: Several open stories can share a title and so a default file name, and a file opened in one Egon layout should not switch layouts when saved back.
- Decision: save_story replaces a file without `overwrite` only if this story was the last to open or write it, and writes the `layout` it is given, else the layout of a file this session opened or wrote, else the server setting.
- Consequences: One story cannot replace another story's file, and closing a story gives up its files, so a new story with the same title and id cannot overwrite them. Files are known by their real path, so a linked folder or another letter case reaches the same owner.
