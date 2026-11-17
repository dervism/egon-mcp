# 16. Decide group membership by position, as Egon does

- Status: Accepted
- Date: 2026-11-17
- Context: Egon reads `parent` but often leaves it out of its files, and counts an element as part of a group when the element's top-left corner lies inside the group's box. A story in memory followed other rules than the same story after a save and reopen.
- Decision: Opening a file, drawing a box with coordinates, and adding or moving a shape all apply Egon's top-left rule, and a group only goes into a larger group. A box fitted around `members` holds only them, and validate_story warns about anything else whose corner it covers.
- Consequences: A story has the same groups before and after a save, and auto_layout gives the same result on the reopened file. A shape placed inside a box joins the group, so new shapes without a position go to a free spot outside every box.
