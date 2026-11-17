# Domain Storytelling for agents

Domain Storytelling is a collaborative modeling method by Stefan Hofer and Henning Schwentner. Domain experts tell how they work, and a moderator draws each step with a small picture language while they talk. Egon is the browser tool for those pictures. This file covers what an agent needs to model well; the server also serves a short version as the resource `egon://guide/domain-storytelling`.

## The picture language

| Element | Meaning | In egon-mcp |
|---|---|---|
| Actor | Someone or something that acts: a person, role, team or system | `add_actor`, or the `actor` of a sentence |
| Work object | What actors work with: a document, call, email, payment, product, piece of information | `add_work_object`, or the `workObject` of a sentence |
| Activity | An arrow labeled with a verb, from an actor to a work object, numbered by step | `add_activity`, or the `activity` of a sentence |
| Recipient | An unnumbered arrow from a work object to another actor, labeled with a preposition | the `to` list of a sentence |
| Group | A box around elements that belong together | `add_group` |
| Annotation | A note on an element | `add_annotation` |

A step reads as a sentence: "Clerk (actor) writes (activity) Order slip (work object) for (preposition) Pizza baker (recipient)."

## Scope

Every story should say what kind of story it is. Egon stores three scope settings, and `set_story_info` or the `scope` argument of `build_story` sets them.

- Granularity: how detailed the steps are. `coarse-grained` gives the big picture across departments, `fine-grained` shows a single task. The goal levels `cloud-level`, `kite-level`, `sea-level`, `fish-level` and `clam-level` are an alternative scale borrowed from use cases.
- Point in time: `as-is` tells how work happens today; `to-be` tells how it should happen with a new process or system.
- Domain purity: `pure` leaves software out, so the story shows the business; `digitalized` shows systems as actors.

Pick one value for each before you start, and keep the whole story at that level. A coarse-grained story that suddenly lists button clicks mixes levels.

## Modeling guidelines

1. One story, one case. Tell a concrete example from start to end, usually the normal case. Exceptions go into annotations or separate stories.
2. Use names from the domain. Do not translate them into technical terms, and keep each name the same in every step.
3. Verbs are in the present tense and active voice: "sends", "checks", "approves".
4. Every step needs an actor. "Order gets checked" is not a step; ask who checks it.
5. Two actors never connect directly. Draw the work object between them; for conversations use a Call or Conversation work object.
6. Systems only appear in digitalized stories. In a pure story the clerk "writes" the order slip; in a digitalized one the clerk "enters" the order into the Order system.
7. Parallel actions share a step number.
8. Stay around 10 to 20 steps. If a story grows beyond that, split it by phase and name the hand-over point.

## Running an interview

When the user knows the domain but has no description yet, interview them and model while they talk. The `domain_story_interview` prompt sets this up. Good questions, in order:

1. "Which case do we look at, and who starts it?"
2. "What does that person do first, and with what?"
3. "Who gets it next?" and "What happens then?"
4. "Is that always so, or only in this case?" Record the answer as an annotation instead of a branch.
5. "How do you know it is done?"

After each answer, add the step with `add_sentence` and read it back as one sentence. Wrong words found now are cheap to fix. When the story is complete, run `auto_layout`, `validate_story` and `narrate_story`, and let the user confirm the full list.

## Reviewing a story

Check, in this order:

1. `validate_story` has no errors.
2. Every step in `narrate_story` reads as a correct sentence and matches what the user said.
3. Names are consistent (no "Order" next to "Purchase order" for the same thing).
4. The story stays on one granularity and one point in time.
5. Systems appear only if the story is digitalized.
6. Annotations cover the open questions and variations that came up.
