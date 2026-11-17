# Domain-Driven Design and requirements

Domain-Driven Design (DDD) is an approach to building business software around a model of the domain, worked out by domain experts and developers together. It does not prescribe a modeling method; Domain Storytelling is one that fits it well, on the strategic level (language, boundaries) and the tactical level (code). This reference shows how to use domain stories for both, and how to turn them into requirements. Points marked as heuristics are common practice, not rules of the method.

## Ubiquitous language

In DDD, a ubiquitous language is the shared language of experts and developers inside one bounded context. It comes from the domain language and should appear everywhere: in conversations, on the whiteboard and in the code. A company usually has several of them, one per bounded context, not one language for the whole company.

Domain stories build that language naturally, because every label is a term the experts use. After a few stories the modeler knows the core nouns (actors and work objects) and verbs (activities) of the domain.

With egon-mcp:

- Use the experts' terms in every label, and keep one name per thing within a story.
- Collect the terms from `get_story` (actors, work objects, activities) into a glossary, and attach definitions of unclear terms as annotations.
- Watch for the same word with different meanings in different parts of a story, and for different words for the same thing. Both are heuristics for a boundary between two languages, and so between two bounded contexts.

## Subdomains and bounded contexts

A domain is usually too large to model as a whole. DDD splits it into subdomains, areas of the business, and designs bounded contexts, each with its own model and language, as the software's answer to them. Domain Storytelling helps find the boundaries.

1. Tell a coarse-grained, pure, as-is story of a typical case from start to end.
2. Look for places where the story changes its character. Heuristics: a work object changes its meaning or name; the work moves to another department or another purpose; a different vocabulary starts; one part could happen without the other.
3. Draw a labeled group around each area with `add_group`. A grouped story shows subdomains, not yet bounded contexts.
4. Tell fine-grained stories for the subdomains that matter, to see what happens inside them.
5. Decide on bounded contexts. Arrows that cross a group boundary, where a work object goes from one area to another, are the relationships a context map will show.

Example 2 in `examples.md` is a coarse story grouped into Repair, Purchasing and Billing.

Uses of the boundaries: splitting a monolith, designing microservices or self-contained systems, and organizing teams around parts of the domain.

## Messages between bounded contexts

Domain Message Flow Modeling, introduced by Nick Tune and inspired partly by Domain Storytelling, shows how commands, events and queries flow between bounded contexts. It helps check new boundaries for coupling, find hidden complexity before building, and analyze an IT landscape by domain instead of by existing systems. It maps onto the picture language:

| Message flow | Domain story element | Suggested icon |
|---|---|---|
| User (persona, role) | Actor | `Person` |
| Bounded context | Actor | `Cloud` |
| External system | Actor | `Settings` |
| Command | Work object | `Email` |
| Event | Work object | `Flag` |
| Query or view | Work object | `Search` |

The arrows carry no verbs, because the intention is already in the message; message contents go into annotations on the messages. Like any domain story, one picture shows one scenario, so a variant (one item out of stock) gets its own picture. Keep bounded contexts and external systems apart: the organization controls a bounded context, but not an external system. Modeling contexts as actors also avoids deciding too early whether each becomes its own service.

Example 10 in `examples.md` builds such a model. `validate_story` warns about the unlabeled arrows and `narrate_story` shows placeholders; both are expected here.

## From stories to code

Teams use domain stories to decide which DDD building block fits which concept. Heuristics for a first domain model:

- Work objects that have an identity and change over time (an order, a contract, a repair) are candidates for entities or aggregates; the names a work object takes along the story ("Contract", "Voted contract") are its states.
- Work objects that only describe something (a price, an address, a delivery date) are candidates for value objects.
- Activities are candidates for commands and methods ("approve", "mark seat"); what they cause can become domain events.
- Annotations with rules ("only after the vote") are candidates for invariants and policies.
- Actors are candidates for roles and users, or, in digitalized stories, for other systems to integrate with.

Use the experts' terms for the names in the code.

## From stories to requirements

Sometimes the shared understanding from stories is enough to start building, but usually requirements bridge the gap between scenarios and code. Derive them from to-be stories, so the team can discuss priorities and viable products:

- One sentence of a to-be story becomes one user story. The actor is the role, the activity with its work object is what the role wants, and the step that this sentence enables is the benefit. Sentence "Cashier searches Available seats in Seating plan" becomes: as a cashier, I want to search for available seats of a show, so that I can offer them to a moviegoer.
- The sentences of a story, in order, form the backbone of a user story map; slices across it give releases.
- Annotations with variations, rules and assumptions give acceptance criteria and examples, and Example Mapping can take them further.
- Each requirement keeps a link to its story, so the team knows the context it belongs to.

Domain stories also help to find use cases, but test an expert's list of use cases against concrete stories: retelling often shows that a supposed special case is only a detail of another.

## Other collaborative methods

Domain stories combine well with other methods: EventStorming to explore a domain through its events, Example Mapping to work out rules with examples, and User Story Mapping to plan delivery. Variations of the method include Storystorming and Domain Message Flow Modeling. Domain Storytelling differs from BPMN less in how the picture looks than in the conversation that leads to it, and in telling concrete cases instead of all paths.

## Sources

Summarized in our own words from [domainstorytelling.org](https://domainstorytelling.org) by Stefan Hofer and Henning Schwentner (CC BY 4.0), in particular its pages on Domain-Driven Design and requirements and its article on Domain Message Flow Modeling, and from their book "Domain Storytelling" (Addison-Wesley, 2022). The heuristics marked as such are general DDD practice.
