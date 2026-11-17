# 10. Offer sentence-level tools next to element-level tools

- Status: Accepted
- Date: 2026-11-17
- Context: Agents think in domain story sentences, while Egon stores loose shapes and arrows with ids and coordinates.
- Decision: build_story and add_sentence accept sentences and find or create elements by name, while add_actor, add_activity and update_element remain for precise edits.
- Consequences: A whole story takes one call and needs no coordinates, and element-level tools still cover anything the sentence form cannot express.
