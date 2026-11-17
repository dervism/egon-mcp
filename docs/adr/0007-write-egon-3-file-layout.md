# 7. Write the Egon 3 file layout by default

- Status: Accepted, amended by [ADR 15](0015-file-ownership-per-story-layout-per-file.md)
- Date: 2026-11-17
- Context: The public app at egon.io runs Egon 3.2.1, which only reads `{ domain, dst }` files, while the unreleased Egon 4 on `main` writes `{ iconSet, domainStory }` and still reads the old layout.
- Decision: The server writes the Egon 3 layout unless started with `--egon-format egon4` or told otherwise per save (ADR 15), and the parser reads every layout Egon has used.
- Consequences: Files work in both Egon versions, but title and scope only survive in the Egon 4 layout, so the server names files after the title, which is where Egon 3 reads it from.
- Alternatives: Writing only Egon 4 files was tried first and failed to render in the public app.
