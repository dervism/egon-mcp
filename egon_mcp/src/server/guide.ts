/** Short notation guide served as the egon://guide/domain-storytelling resource. */
export const DOMAIN_STORYTELLING_GUIDE = `# Domain Storytelling in Egon

Domain Storytelling is a workshop method: domain experts tell how they work, and a moderator draws the story as a picture language. Egon is the browser tool that draws these pictures.

## Building blocks

- Actor: a person, group or system that does something. Draw it with an actor icon such as Person, Group or System.
- Work object: the thing actors work with, such as a document, a phone call, an email or money. Draw it with a work object icon.
- Activity: an arrow labeled with a verb. An activity from an actor to a work object gets a step number.
- Recipient: an unnumbered arrow from a work object to another actor completes the sentence ("Customer tells Order to Clerk").
- Group: a box around elements that belong together. For a subdomain, group the work objects of the sentences that belong together and keep the actors outside (add_group with steps); a department or a location may hold actors too.
- Text annotation: a note attached to an element, for variations, rules or open questions.

## Sentences

Each numbered step reads as a sentence: actor, verb, work object, then optional recipients.

1. Customer tells Order to Clerk.
2. Clerk writes Order on Order slip.
3. Pizza baker bakes Pizza.

Rules that Egon enforces:

- Two actors are never connected directly. Put the work object they exchange between them.
- Work objects can lead to other work objects ("Clerk turns Order into Invoice").
- Several activities may share a number to show parallel actions.

## Good practice

- Tell one concrete case (a happy path) per story. Model variations as separate stories or as annotations.
- Draw each actor once, but give every sentence its own work objects; name a new copy after its new state (Contract, Signed contract).
- Put the assumptions that keep the story on one path into its description.
- Use the domain's own words for actors, work objects and verbs, and keep verbs in the present tense.
- Keep a story to roughly 10 to 20 steps; split longer ones.
- Use the same name for the same thing everywhere. Egon's label dictionary lists names across a story.

## Scope

A story can record its scope:

- Granularity: coarse-grained, medium-grained, fine-grained, or the goal levels cloud, kite, sea, fish and clam.
- Point in time: as-is (how work happens today) or to-be (how it should happen).
- Domain purity: pure (no software) or digitalized (systems appear as actors).
`;
