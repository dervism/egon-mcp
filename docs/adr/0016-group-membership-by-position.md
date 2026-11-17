# 16. Decide group membership by position, as Egon does

- Status: Accepted
- Date: 2026-11-17
- Context: Egon's import reads `parent` and then drops it, so files saved again from Egon lack it, while Egon's group tool takes in the elements whose top-left corner lies inside a box. A story in memory followed other rules than the same story after a save and reopen.
- Decision: Opening a file, drawing a box with coordinates, and adding or moving a shape all apply the top-left rule of Egon's group tool, and a group only goes into a larger group. A box fitted around `members` holds only them; validate_story and save_story warn about any other shape it covers, which a reopened file would add.
- Consequences: After auto_layout, or when no warning is left, a story has the same groups before and after a save, and auto_layout gives the same result on the reopened file. A shape placed inside a box joins the group, so new shapes without a position go to a free spot outside every box.
