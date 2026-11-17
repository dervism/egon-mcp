# 13. Draw a new work object for each sentence

- Status: Accepted
- Date: 2026-11-17
- Context: Egon's replay continues a sentence along every outgoing arrow of its work object, so a work object shared by several sentences pulls later recipients into earlier steps.
- Decision: build_story and add_sentence share actors by name but draw a new work object per sentence, copying icon and color from earlier ones of that name, unless the sentence passes an id, sets `reuseWorkObject`, or names a declared work object that is not used yet.
- Consequences: Stories narrate correctly and match how Egon users draw. A name can now belong to several work objects, so groups take all of them, annotations the first, and other tools ask for the id.
