# 17. Group by steps, and take existing groups in whole

- Status: Superseded by [ADR 19](0019-groups-hold-what-you-name.md)
- Date: 2026-11-17
- Context: Subdomains are cut from a coarse story by sentences, holding their work objects but not their actors, and agents add nested groups in any order, so a box that holds only its named members left inner groups empty or cut through them.
- Decision: add_group and build_story groups take step numbers, which put in the work objects of those sentences, a shared one only when named in `members` (a name meaning the copies those steps use); a new group holds its members, any existing group whose contents are all among them, and the notes that move with them, and a fitted box goes into the innermost group that holds all of them, which grows to fit.
- Consequences: A coarse story can be cut into nested subdomains with one call per group; members that are exactly one group nobody named, steps whose box would cross another group, and steps together with x and y are refused, and build_story adds groups that name members first so the order of its list does not matter.
