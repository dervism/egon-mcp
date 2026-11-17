# 13. Draw a new work object for each sentence

- Status: Accepted
- Date: 2026-11-17
- Context: Egon's replay continues a sentence along every outgoing arrow of its work object, so a work object shared by several sentences pulls later recipients into earlier steps.
- Decision: build_story and add_sentence share actors by name but draw a new work object per sentence, unless the sentence passes a work object id or `reuseWorkObject`.
- Consequences: Stories narrate correctly and match how Egon users draw, and a story can hold several work objects with the same name, so tools resolve such names to all of them (groups) or the first one (annotations).
