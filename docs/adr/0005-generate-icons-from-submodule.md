# 5. Generate built-in icon data from the egon.io submodule

- Status: Accepted, amended by [ADR 14](0014-license-gpl-3-or-later.md)
- Date: 2026-11-17
- Context: Egon ships about 125 built-in icons in a GPLv3 source file, and our server needs their names, keywords and SVGs to validate and render stories.
- Decision: A script extracts the icons from `modules/egon.io` into a gitignored JSON file before every build and test run.
- Consequences: Building needs the submodule checked out, and the icon data stays out of git. Egon's license matches ours ([ADR 14](0014-license-gpl-3-or-later.md)).
