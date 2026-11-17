# 16. Decide group membership by position, as Egon does

- Status: Accepted, amended by [ADR 18](0018-groups-hold-what-you-name.md)
- Date: 2026-11-17
- Context: Egon's import reads `parent` and then drops it, so files saved again from Egon lack it, while Egon's group tool takes in the elements whose top-left corner lies inside a box. A story in memory followed other rules than the same story after a save and reopen.
- Decision: open_story, drawing a box with coordinates, and adding or moving a shape all apply the top-left rule of Egon's group tool, and a group only goes into a larger group. A box fitted around `members` holds only them; validate_story warns about any other shape it covers, and save_story lists every group change open_story would make.
- Consequences: A story saved without groupChangesOnOpen has the same groups after open_story, and auto_layout gives the same result on the reopened file; Egon shows only the groups the file records. A shape placed inside a box joins the group, so new shapes without a position go to a free spot outside every box.
