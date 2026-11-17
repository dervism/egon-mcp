# 10. Offer sentence-level tools next to element-level tools

- Status: Accepted, amended by [ADR 13](0013-new-work-object-per-sentence.md)
- Date: 2026-11-17
- Context: Agents think in domain story sentences, while Egon stores loose shapes and arrows with ids and coordinates.
- Decision: build_story and add_sentence accept sentences, find or create actors by name and draw work objects as ADR 13 describes, while add_actor, add_activity and update_element remain for precise edits.
- Consequences: A whole story takes one call and needs no coordinates, and element-level tools still cover anything the sentence form cannot express.
