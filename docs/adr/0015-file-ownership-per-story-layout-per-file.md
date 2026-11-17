# 15. Track file ownership per story and layout per file

- Status: Accepted
- Date: 2026-11-17
- Context: Several open stories can share a title and so a default file name, files can change outside the server, and an Egon 4 file should not turn into Egon 3 when saved.
- Decision: save_story replaces a file without `overwrite` only while it holds exactly what this story last read from or wrote to it, compared by content hash. It writes the `layout` it is given, else the story's own layout for its own file, else the layout of the Egon file it replaces, else the server setting.
- Consequences: No story silently overwrites another story's save or an edit made outside the server, and links or other letter cases count as one file because files are known by device and inode. Closing a story gives up its files.
