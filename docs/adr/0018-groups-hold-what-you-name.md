# 18. Groups hold what you name

- Status: Accepted, supersedes [ADR 17](0017-group-by-steps-and-whole-groups.md)
- Date: 2026-11-17
- Context: The rules of ADR 17 grew an exception in every review round (shared work objects, whole groups, crossing boxes, the group a box is drawn in), so an agent could not tell in advance what add_group would do or refuse.
- Decision: Steps pick the work objects that first appear in them and leave one that sits in another group there, named members move in from anywhere, and any group whose actors and work objects are all chosen goes in whole; the new group goes into the innermost group around the steps' work objects (or the members), which grows to fit, and a box drawn with x and y follows Egon's group tool alone.
- Consequences: add_group refuses unknown elements and steps, steps that leave nothing to group, members or steps with x and y, x without y, and boxes past a billion pixels; build_story adds groups with fewer steps first, so nesting by steps does not depend on the order of its list.
