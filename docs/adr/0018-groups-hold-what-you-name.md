# 18. Groups hold what you name

- Status: Proposed, supersedes [ADR 17](0017-group-by-steps-and-whole-groups.md)
- Date: 2026-11-17
- Context: The rules of ADR 17 grew an exception in every review round (shared work objects, whole groups, crossing boxes, the group a box is drawn in), so an agent could not tell in advance what add_group would do or refuse.
- Decision: A group fitted around members or steps holds the named elements and, for steps, the work objects that first appear in them; a named group, and any group whose actors and work objects are all members, goes in whole, the new group goes into the innermost group that holds every member, which grows to fit, and other members leave their old groups. A box drawn with x and y follows Egon's group tool alone and takes no members or steps.
- Consequences: add_group refuses only unknown elements or steps, steps that bring no work object of their own, and members or steps together with x and y; a group whose members came from different groups can cross their boxes until auto_layout runs, and validate_story reports that.
