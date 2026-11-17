# 15. Track file ownership per story and layout per file

- Status: Accepted
- Date: 2026-11-17
- Context: Several open stories can share a title and so a default file name, files can change outside the server, and an Egon 4 file should not turn into Egon 3 when saved.
- Decision: save_story replaces a file without `overwrite` only if this story was the last to open or write it and the file has not changed since. It writes the `layout` it is given, else the layout of the Egon file it replaces, else the story's own layout when its file has gone, else the server setting.
- Consequences: No story overwrites another story's file or changes made outside the server, and links or other letter cases reach the same owner because files are known by device and inode. Closing a story gives up its files.
