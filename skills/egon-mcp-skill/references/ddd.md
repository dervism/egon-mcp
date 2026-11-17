# Domain-Driven Design and requirements

Domain-Driven Design (DDD) is an approach to building business software around a model of the domain, worked out by domain experts and developers together. It does not prescribe a modeling method; Domain Storytelling is one that fits it well, on the strategic level (language, boundaries) and the tactical level (code). This reference covers language, code and requirements; `bounded-contexts.md` covers boundaries. Points marked as heuristics are common practice, not rules of the method.

## Ubiquitous language

In DDD, a ubiquitous language is the shared language of experts and developers inside one bounded context. It comes from the domain language and should appear everywhere: in conversations, on the whiteboard and in the code. A company usually has several of them, one per bounded context, not one language for the whole company.

Domain stories build that language naturally, because every label is a term the experts use. After a few stories the modeler knows the core nouns (actors and work objects) and verbs (activities) of the domain.

With egon-mcp:

- Use the experts' terms in every label, and keep one name per thing within a story.
- Collect the terms from `get_story` (actors, work objects, activities) into a glossary, and attach definitions of unclear terms as annotations.
- Watch for the same word with different meanings in different parts of a story, and for different words for the same thing. Both point to a boundary between two languages, and so between two bounded contexts; keep one glossary per bounded context (`bounded-contexts.md`).

## Subdomains, bounded contexts and message flows

Finding subdomains in a coarse story, designing bounded contexts from them, glossaries per context, the Bounded Context Canvas, context maps and the message-flow variant are covered step by step in `bounded-contexts.md`.

## From stories to code

Teams use domain stories to decide which DDD building block fits which concept. Heuristics for a first domain model:

- Work objects that have an identity and change over time (an order, a repair, an invoice) are candidates for entities or aggregates; the names a work object takes along the story ("Repair estimate", "Accepted estimate") are its states.
- Work objects that only describe something (a price, an address, a delivery date) are candidates for value objects.
- Activities are candidates for commands and methods ("accept estimate", "order part"); what they cause can become domain events.
- Annotations with rules ("only after the vote") are candidates for invariants and policies.
- Actors are candidates for roles and users, or, in digitalized stories, for other systems to integrate with.

Use the experts' terms for the names in the code.

## From stories to requirements

Sometimes the shared understanding from stories is enough to start building, but usually requirements bridge the gap between scenarios and code. Derive them from to-be stories, so the team can discuss priorities and viable products. A heuristic that works well:

- Take a digitalized to-be story and pick the sentences in which the software takes part; steps people do without software ("Customer brings Bike to Mechanic") need no user story. Each picked sentence can become a user story: the actor is the role, the activity with its work object is what the role wants, and the step that this sentence enables is the benefit. Sentence "Mechanic checks Part stock in Workshop app" becomes: as a mechanic, I want to check whether a part is in stock, so that I can tell the customer when the bike will be ready.
- The sentences of a story, in order, form the backbone of a user story map; slices across it give releases.
- Annotations with variations, rules and assumptions give acceptance criteria and examples, and Example Mapping can take them further.
- Each requirement keeps a link to its story, so the team knows the context it belongs to.

Domain stories also help to find use cases, but test an expert's list of use cases against concrete stories: retelling often shows that a supposed special case is only a detail of another.

## Other collaborative methods

Domain stories combine well with other methods: EventStorming to explore a domain through its events, Example Mapping to work out rules with examples, and User Story Mapping to plan delivery. Variations of the method include Storystorming and Domain Message Flow Modeling. Domain Storytelling differs from BPMN less in how the picture looks than in the conversation that leads to it, and in telling concrete cases instead of all paths.

## Sources

Summarized in our own words from [domainstorytelling.org](https://domainstorytelling.org) by Stefan Hofer and Henning Schwentner ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), in particular its pages on Domain-Driven Design and requirements and its article on Domain Message Flow Modeling, and from their book "Domain Storytelling" (Addison-Wesley, 2022). The heuristics marked as such are general DDD practice.
