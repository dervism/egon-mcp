# Domain Storytelling: the method

This reference explains the method behind the tools: how domain stories are drawn, which case to tell, at what level, in what style, and how to run the conversation that produces them. `SKILL.md` has the short version and `modeling-patterns.md` the tool calls for each pattern. The server also serves a short guide as the resource `egon://guide/domain-storytelling`.

## What it is and why it works

Domain Storytelling is a collaborative modeling method developed by Stefan Hofer and Henning Schwentner, with roots at the University of Hamburg. Domain experts tell how they work together, one concrete case at a time, and a moderator draws each sentence while they talk, with a small picture language. Everyone sees immediately whether the listener got it right.

It is first a way to hold good conversations about a business, and only second a notation. The drawing serves the storytellers while they tell; afterwards it reminds the participants of what was said and helps them retell the story to others. It is not meant as a stand-alone specification.

Telling stories is how people have always passed on knowledge, and it still works for software. Developers need to understand the part of the business they build software for, and written specifications have often widened the gap between business and IT. Stories help to:

- understand a domain and learn its language,
- build a shared language between domain experts and IT experts,
- find and clear up misunderstandings,
- clarify requirements and build the right software,
- draw boundaries that structure the domain, the software and the teams,
- design business processes that software supports well,
- see the IT landscape that people actually use.

## The picture language

| Building block | Meaning | In egon-mcp |
|---|---|---|
| Actor | Someone who plays an active role: a person, a group of people, an organizational unit, or in digitalized stories a software system. Labeled with a role, rarely with a person's name. | `add_actor`, or the `actor` of a sentence |
| Work object | What actors create, use and pass on: documents, physical things, digital objects, and information about them. | `add_work_object`, or the `workObject` of a sentence |
| Activity | An arrow labeled with a verb from the domain language. | `add_activity`, or the `activity` of a sentence |
| Sequence number | The order of the sentences, at the start of the arrow that holds the verb. | set automatically; `number` for parallel steps |
| Annotation | A text note that complements the sentences. | `add_annotation` |
| Group | A labeled outline around parts that belong together. | `add_group` |

A domain story also gets a name, which frames the story told. Revise it as the story evolves.

### Sentences

Activities connect actors and work objects into sentences. Every sentence starts with the actor who initiates the activity: who does what with what with whom. The basic form is subject, predicate, object; richer forms are allowed:

1. A works on w: the mechanic inspects the bike.
2. A works on w using v: the mechanic writes the defects on the repair slip.
3. A hands over w to B, or A exchanges information about w with B: the clerk hands the order slip to the baker.
4. The same, with several recipients: the clerk sends the invoice to the customer and the accountant.
5. A and B collaborate on w, both arrows with the same number: customer and mechanic sign the handover form.

Only the first arrow of a sentence, the one leaving the actor, carries the number and the main verb. The arrows that continue from the work object carry the connecting words: to, for, in, from, with, using, on. A continuation arrow can also carry a second verb ("test-rides the bike and hands it back to the customer"). Leave it unlabeled only if the sentence reads naturally without a word.

### Actors once, work objects per sentence

Each actor appears once in a story, and every sentence that involves it connects to the same icon. Work objects are the opposite: every sentence gets its own, even when the same thing appeared before. That keeps the picture readable (otherwise several arrows go in and out of one icon), and it lets a work object change along the way:

- When its state changes, the new copy gets a new name: a repair estimate becomes an accepted estimate; a bike becomes a repaired bike.
- When its medium changes, the new copy gets a new icon: an order taken on the phone is a call, the same order typed into a system is a document; an appointment request arrives by email and is then printed.
- When only information about it changes hands, the information is the work object. Spoken information gets a speech bubble.

### Annotations and groups

Annotations hold what the sentences cannot show: variations (other cases, optional steps, possible errors), the goal of an activity, explanations of domain terms, assumptions, frequencies, where something is kept, and anything else noteworthy. Attach each annotation to the element it is about. Assumptions that hold for the whole story belong in the story's description.

A group clusters parts of a story that belong together and is drawn as an outline with a label that says what it means. Typical meanings:

- activities that repeat,
- activities that are optional,
- parts of the story that happen in different places,
- organizational boundaries,
- subdomains,
- in a to-be story, what is new or will change.

### Icons

Icons should make the story tangible. A good icon set is small, simple and distinct, and fits the domain: too many icons water the picture language down. Never use the same icon for actors and work objects in one story. In a workshop, say what an icon stands for when you first use it (for example, that a phone means the mechanic calls the customer), which invites the experts to suggest a better one.

## Scenario-based modeling

The picture language has no symbols for conditions, alternatives or loops, on purpose. Most process notations try to show everything that could happen; Domain Storytelling tells one concrete, meaningful example from beginning to end. Abstractions made before the typical cases are understood are often wrong, and they help little in understanding a domain. A diagram of all paths also loses the thread of any one case.

- Start with the standard case, the one that covers most instances, and its happy path: no exceptions, no errors, everything works. It shows what the process is for and why people do what they do.
- If no case is typical, model several real past cases of increasing difficulty: a simple one, a moderately difficult one, a difficult one.
- Write down the assumptions that keep the story on its single path, for example that the parts needed are in stock.
- Later, ask what could go wrong, and tell important variations and error cases as stories of their own. Usually a few stories are enough to understand a process.
- Small variations such as optional steps are not worth their own story; record them as annotations.

### Repetition without loops

Choose by granularity:

- Coarse: annotate the repeated sentence ("for every line item on the pick list"). The story says what happens, not how often.
- Medium: draw a labeled group ("repeated for each line item") around the work objects of the repeated sentences.
- Fine: spell out a concrete case, one sentence per round (front brake, rear brake, chain). It is the biggest model, but it shows whether the rounds really are handled the same way. If they are, an annotation or a group is better.

## Scope

No single scope suits every purpose. The purpose decides the scope of a story, and scope has three factors.

| Factor | Values | What changes |
|---|---|---|
| Granularity | coarse-grained, medium-grained, fine-grained | Coarse stories cover a whole case in about ten sentences and say what happens; fine stories show one part step by step and say how, often with concrete quantities. |
| Point in time | as-is, to-be | As-is stories describe today's work, to-be stories the work as it should be with a new process or software. |
| Domain purity | pure, digitalized | Pure stories show only people and organizations; digitalized stories also show software systems as actors that do things. |

Egon also offers goal levels as an alternative scale for granularity: cloud, kite, sea, fish and clam level, from the widest overview down to single tasks.

Keep a story at one level. A coarse story that suddenly lists form fields mixes levels; tell that detail as a separate fine-grained story. Typical progressions:

- Learning a domain: coarse, pure, as-is first; then fine-grained stories for the parts that matter.
- Designing software: agreed as-is stories, then pure to-be stories that show the new way of working, then digitalized to-be stories that show which system does what.
- Digitalization or a new system: compare a pure as-is story with a digitalized to-be story, and color what changes.

## Style: good habits and traps

Good habits:

1. Draw fresh work objects in each sentence instead of routing many arrows through one.
2. When a sentence involves two things, draw both. Novices tend to hide the second object inside the verb ("writes up the defects" instead of "writes Defects on Repair slip").
3. Label every actor, work object, activity and group.
4. Keep the icons for actors and for work objects apart.
5. Use the storytellers' terms, not your own, and do not push your opinion on them. Ask "Is this the right term?".
6. Write anything noteworthy down as an annotation, so people can see it, point at it and object to it.
7. When the story seems finished, retell it from beginning to end and check that everyone agrees.

Traps:

- Jumping to abstraction: modeling every possible path before one typical case is understood.
- Vague subjects: "you check it", "it gets approved". Ask who does it.
- Technical or data-flow language: a story tells what people do with things, in their words. Even a digitalized story says "enters the order into the shop system", not "the frontend posts the order to the API".
- Mixing granularities or points in time in one story.
- Treating an expert's first list of use cases as fact. Retelling concrete stories often shows that a supposed special case does not exist.
- Plot holes: parts of a story that do not connect. Ask why; there is usually a missing step or a missing story.
- Modeling every small variation as its own story.

## Workshops

### Preparing

The workshop brings together people who want to exchange knowledge for a specific purpose. The purpose decides the granularity of the stories and who should attend. Usually one person, the host, organizes it and invites the participants. Before inviting anyone, the host and the moderator should agree on:

- what the workshop should find out,
- which problems hurt most today,
- who already works on those problems,
- whose view of the work must not be missing,
- which activities matter most to the organization.

Then agree on the processes or cases to cover and on the scope of each story. Invite the people who actually do the work rather than someone who knows it secondhand, and look past organizational boundaries: where knowledge is split between departments, invite someone from each, because nobody knows the whole process alone.

### Roles

- Storytellers share their knowledge, often domain experts from several departments.
- Listeners want to learn, often a development team.
- The moderator steers the storytellers towards the purpose and keeps the story going.
- The modeler records the story; often the moderator does both.
- The host invited everyone.

When you, the agent, interview a user, you are moderator and modeler at once.

### During the story

Questions that keep the story going:

- "What happens next?"
- "Where do you get this information?"
- "How do you decide what to do next?"
- "How do you do that?"
- "Who does this?" (when the storyteller says "you" or uses the passive)
- "Which case is the most common?" (to choose the scenario)

Ask why when an activity seems to have no purpose. If the answer is habit, nobody knows, a guess about what another department needs, or a limit of the current software, you have often found a real problem in the process or in its software. Asking why more than once can be necessary.

Record the story sentence by sentence, at the pace of the telling, and retell each sentence as you add it. With egon-mcp: `add_sentence` per answer, then `narrate_story` to read the new sentence back.

### Finishing

When the story seems complete, tell it again from the beginning and seek agreement: did we miss something, is something wrong, do all the experts agree? Then go through the annotations for possible alternative stories. The participants decide which are minor variations and which deserve a story of their own. Ask about:

- Whether a variation is the same task done another way, or a task of its own.
- What would change in the story under one particular condition.
- A short summary of the difference in your own words, for the participants to confirm or correct.

You will rarely bring everyone to one view. Do not hide conflicts behind abstractions; record unresolved differences as annotations so everyone sees them. If needed, plan a follow-up to look at parts in more detail or at important variations.

### After the workshop and tools

Other artifacts grow around domain stories: glossaries, context maps, requirements, code. The conversation often continues with EventStorming, Example Mapping or User Story Mapping.

On a whiteboard, icons go on sticky notes and arrows directly on the board, so the story is easy to rearrange. Digital tools such as Egon work well with a projector or screen sharing, so everyone sees the model. Egon's replay walks through a story sentence by sentence, which is good for reviews.

## What the method is used for

- Learning the domain language: when you are new to a domain, when experts from several departments should cross boundaries and challenge assumptions, when software does not use the real terms, or when no shared language exists yet.
- Finding boundaries: to split a monolith, design microservices or self-contained systems, find bounded contexts in Domain-Driven Design, or organize the work of several teams. See `ddd.md`.
- Working with requirements: find out what the software should do, derive user stories and use cases, and keep the context of each requirement. See `ddd.md`.
- Modeling in code: take the terms and concepts of the stories into an object-oriented or functional domain model.
- Supporting organizational change: design how work should be done, optimize processes, discuss and promote a change, and roll out new software. Digitalizing a bad manual process does not make it better.
- Deciding make or buy and choosing off-the-shelf software: tell one to-be story per candidate and make the differences visible.
- Finding shadow IT: digitalized as-is stories show the spreadsheets and small tools that people use and that central IT does not know about.
- Seeing the IT landscape by domain rather than by existing systems.

## Reviewing a story

Check, in this order:

1. `validate_story` has no errors.
2. Every step in `narrate_story` reads as a correct sentence and matches what the user said.
3. The story tells one case; its assumptions are in the description.
4. Names are consistent (no "Order" next to "Purchase order" for the same thing) and come from the domain.
5. The story stays on one granularity, one point in time and one purity: systems appear only in digitalized stories.
6. Each sentence has its own work objects; state changes have new names; spoken information has a speech bubble.
7. Annotations cover the open questions, variations and rules that came up; groups and annotations are labeled.
8. Nothing is left unconnected without a reason.

## Sources

This guide summarizes, in our own words:

- [domainstorytelling.org](https://domainstorytelling.org) by Stefan Hofer and Henning Schwentner, published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): the quick-start guide and the pages and articles on Domain-Driven Design, requirements, tools, loops and message flows.
- The book "Domain Storytelling: A Collaborative, Visual, and Agile Way to Build Domain-Driven Software" by Stefan Hofer and Henning Schwentner (Addison-Wesley, 2022), and their chapter on Domain Storytelling in the book "Visual Collaboration Tools".
- The example stories in [WPS/egon.io-examples](https://github.com/WPS/egon.io-examples), which you can open with `open_story` after downloading them.
