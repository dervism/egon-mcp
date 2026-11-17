# Subdomains and bounded contexts

Domain Storytelling starts with stories and, in Domain-Driven Design (DDD), goes on to boundaries: which parts of the domain belong together, which models the software needs, and how those parts talk to each other. This reference walks through that second half with the egon-mcp tools, using the bicycle repair shop from `examples.md`. Points marked as heuristics are common practice, not rules of the method.

## Two different things

- A **subdomain** is a part of the business problem: a piece of work that hangs together, such as purchasing parts or checking out a customer. You find subdomains in domain stories. A coarse story with groups shows subdomains.
- A **bounded context** is a part of the software solution: the boundary inside which one model and one language hold. Every term has exactly one meaning inside it. You design bounded contexts from the subdomains, the language, the teams and technical constraints.

The two often match one to one, but not always. One context can serve two subdomains whose language is the same, and one subdomain can need two contexts. A bounded context is a boundary of language and model. It can be a module in a monolith; it does not have to be a microservice. Each context is best owned by one team.

Egon has no notation for bounded contexts or context maps. The grouped coarse story, the fine-grained stories per subdomain and the message-flow variant are drawn in Egon; the classification, glossaries, canvas and context map are text that you write next to them.

## Step 1: tell a story to find boundaries in

- Tell one coarse-grained, pure story of the standard case from start to end, in about ten to fifteen sentences.
- Keep it pure, so that today's software does not decide where the boundaries go. Tell it as-is to understand a domain, or to-be when you design a new way of working.
- Put the scope and the assumptions into the description, for example "Coarse-grained, pure, as-is. Assumptions: happy path; the part is not in stock."

With egon-mcp, use `build_story` with `scope`. Example 2 in `examples.md` is such a story.

## Step 2: find the sentences that belong together

Go through the story with the experts and ask which sentences form one piece of work from the actors' point of view. When people retell the story, they often mark their own part without being asked ("from here on it's my job"). A group that belongs together is easy to name; if nobody can name it, the boundary is probably wrong.

Indicators of a boundary between two parts. Each is only a hint; look for several that point the same way, then check with the experts and with more stories. One story can show a one-way flow that turns out to go both ways in the next.

1. An actor finishes a result on their own, without the others.
2. Information flows one way: from one part to the other, and nothing comes back.
3. The parts start differently: one runs on a schedule (every Friday, at month end), the other on demand (a customer walks in).
4. Some activities serve something outside the story.
5. The language changes: the same word means something else, or another word is used for the same thing.
6. The same work object is used for a different purpose.

More heuristics in the same spirit: a point of no return, where a lasting result is produced (a signed contract, a sent invoice); a work object that changes its nature, not only its state; a hand-off to another department; a change of phase, such as planning against doing.

Never cut along work objects. "Everything about the bike" is no subdomain; the bike takes part in several.

Questions that bring the indicators out in a workshop:

- "Which of these steps are your work, and where does it pass to someone else?"
- "What starts this part? Does it wait for anything?"
- "Does 'part' mean the same to you as to the mechanic?"
- "What happens to the repair report after you hand it over? Do you ever hear back?"

## Step 3: draw the subdomains in Egon

- Mark each subdomain with `add_group` and `steps`: the step numbers of its sentences, as `narrate_story` shows them. Their work objects go into the group and their actors stay outside, because an actor usually takes part in several subdomains (the mechanic in intake, purchasing and repairing). `build_story` takes `steps` in `groups` too. `add_sentence` and `build_story` draw a work object per sentence, but one continued with `reuseWorkObject`, linked to another work object with `add_activity`, or drawn once for several sentences in Egon serves more than one step. Such a work object belongs to the step that drew it, so it goes into that step's group, and grouping other steps later leaves it there. To put it in another group, pass its name in `members` next to that group's `steps`; there a name means the copies those steps use. Inner and outer groups may come in any order in `build_story`: a group by steps takes in every group by steps whose steps are all among its own, unless another group names that one in `members`. With `add_group`, add the inner group first and name it in `members` of the outer one, or add the outer group first; an outer group grows to fit a new group inside it.
- Name a group after the work done in it, with a noun made from a verb: "Repair intake", "Parts purchasing", "Repairing", "Checkout", "Risk assessment". Do not name it after a work object or an actor ("Bike", "Mechanic").
- Write the indicators you relied on as annotations on the work objects where they show ("Every Friday, for all open part requests" on the parts order shows a different trigger).
- Run `auto_layout`. It draws one block per group. An actor outside every group whose arrows all lead into groups stands beside the group it works in most, outside the box; other actors stay in the rows above. It is a first arrangement: when long arrows cross other shapes, tidy the picture in Egon.
- Look at work object names that appear in more than one group, such as the bike in intake, repairing and checkout (each sentence has its own copy). They mark where subdomains touch, and they are where the meaning of a word is likely to differ.
- Keep colors for a second message, such as what will change or what is legally required, and explain them in an annotation. Do not draw one group per actor or per existing IT system to show subdomains.

## Step 4: zoom into each subdomain

Tell fine-grained stories for the subdomains that matter, one story and one file per subdomain and scenario. Egon cannot link stories, so the title and file name carry the connection, for example "Repair a bicycle - Parts purchasing - fine pure as-is", and the description names the coarse story it zooms into. Ask for the variants of each subdomain separately. Example 3 zooms into repair intake; example 9 tells parts purchasing as it really happens, spreadsheets included.

## Step 5: from subdomains to bounded contexts

1. Classify each subdomain. Core: it sets the business apart, so build it and put the best people on it. Supporting: the business needs it and it is specific, but simple. Generic: it works the same everywhere, so consider buying it. Example 10 shows how to compare a candidate product with a to-be story.
2. Collect the terms of each subdomain from `get_story`: actors, work objects and activities inside each group, and the definitions in annotations. Where a term means different things in two subdomains, those need separate models. Where two subdomains use the same terms the same way, one context can serve both.
3. Decide the contexts and write them down: name, the subdomains it serves, its purpose in one or two sentences, its key terms, and the team that owns it.
4. Write one glossary per context. The same word gets one entry in each context where it occurs, with that context's meaning.

The bicycle shop as an example:

| Bounded context | Serves subdomains | Type | Purpose |
|---|---|---|---|
| Workshop | Repair intake, Repairing | Core | Take in bikes, agree on the repair with the customer and repair them. |
| Purchasing | Parts purchasing | Supporting | Get the parts the workshop needs, at the right time and price. |
| Checkout | Checkout | Generic | Take payment and release the bike; a bought point-of-sale system is a candidate. |

Repair intake and repairing share one language (bike, defect, estimate, repair), so one context serves both. Purchasing speaks differently:

| Term | In Workshop | In Purchasing |
|---|---|---|
| Part | What a bike needs, described by what it does and which bike it is for ("rear brake pads for the blue city bike"). | An article with an article number, a supplier, a price and a stock count. |
| Order | The repair the customer agreed to. | The weekly order to a supplier. |

### Bounded Context Canvas

The Bounded Context Canvas by the DDD Crew collects the design of one context on a page. Domain stories fill most of it:

| Canvas section | Where it comes from in the stories |
|---|---|
| Name | The group name, or the context name you chose for several groups. |
| Purpose | What the sentences inside the group achieve, in the experts' words. |
| Strategic classification | Core, supporting or generic, from step 5. |
| Inbound and outbound communication | Work objects that enter and leave the group, or the messages of a message-flow story. |
| Ubiquitous language | Actors, work objects and activities inside the group, with definitions from annotations. |
| Business decisions | Rule annotations, such as "only after the customer approved the estimate". |
| Assumptions | The story descriptions. |
| Open questions | Annotations with open questions and unresolved disagreements. |

## Step 6: map the relationships

Contact points between contexts are where a work object passes from one group to the next, or where a hand-off leads into another group: the part request goes from the workshop to purchasing, the repair report from the workshop to checkout. With actors outside the groups, almost every arrow crosses a group edge, so look at the work objects and hand-offs, not at single arrows.

For each pair of contexts that touch, decide which one depends on the other. The one whose decisions affect the other is upstream; the one that has to live with them is downstream. This is about influence, not about the direction of the arrows: in the bicycle shop the workshop sends part requests to purchasing, yet purchasing is upstream, because it decides which articles, suppliers and delivery dates the workshop gets. A one-way flow between two groups usually means upstream and downstream. A flow both ways, or a work object whose meaning both sides must agree on, needs a closer look at the boundary and at who decides.

Relationship patterns, in short (from Eric Evans' DDD Reference and the DDD Crew's context mapping):

| Pattern | When it fits |
|---|---|
| Partnership | Two teams succeed or fail together and plan their interfaces jointly. |
| Shared kernel | Two contexts share a small, explicitly bounded part of the model, and neither changes it without the other. |
| Customer/supplier | The upstream team plans with the downstream team's needs in mind. |
| Conformist | The downstream context takes over the upstream model as it is, because upstream will not adapt. |
| Anticorruption layer | The downstream context translates the upstream model, often a legacy or bought system, so it does not leak in. |
| Open host service | The upstream context offers one protocol for all its users. |
| Published language | A documented language for the exchange, often an industry standard; it goes well with an open host service. |
| Separate ways | No integration; the contexts do without each other. |

The map for the bicycle shop, as text next to the stories:

| Upstream | Downstream | Relationship | Why |
|---|---|---|---|
| Purchasing | Workshop | Customer/supplier | The workshop depends on what purchasing decides. As the supplier, purchasing takes part requests in the workshop's terms ("brake pads for this bike") and works out the articles itself. |
| Supplier (external) | Purchasing | Anticorruption layer | Purchasing cannot change the supplier's catalogue; it translates the supplier's codes and prices into its own articles, so its model stays clean. |
| Workshop | Checkout | Customer/supplier | Checkout bills what the repair report says, and the workshop keeps checkout's needs in mind. |

That is the map of example 2, the shop as it works today. The target design of example 11 adds one contact: purchasing reports the purchase price of each part to checkout. If the shop later buys a point-of-sale product for checkout, a step beyond example 11, the shop cannot change that product. It then becomes upstream of the workshop and purchasing, and both put an anticorruption layer in front of it, so the product's terms stay out of their models.

Draw the map as it is today first, then the map you aim for, and compare them. Keep each map small and focused on one question.

## Step 7: design the conversation between contexts

The message-flow variant shows how contexts talk in one scenario: people, bounded contexts and other systems are actors; commands, events and queries are work objects; arrows stay unlabeled; message contents go into annotations. Keep it to about five to nine messages, and draw variants as stories of their own. Icons are free to choose. This skill uses `Cloud` for a bounded context, `Settings` for a system the organization does not control, `Person` for people, `Email` for a command, `Flag` for an event and `Search` for a query, and says so in the description. Example 11 shows the bicycle shop's part order as a message flow.

Modeling contexts as actors, not as systems, keeps open whether each becomes a service of its own. A message flow shows one scenario, not the whole map.

## From contexts to code

Each context becomes a module of its own, with its own classes for the words it shares with other contexts: `Part` in Workshop and `Part` in Purchasing are different classes, and the contexts pass identifiers or messages between them, not shared objects. `ddd.md` lists heuristics from stories to entities, value objects and events.

## Pitfalls

- One model for the whole company. It ends in a model that fits nobody.
- Cutting along work objects, or naming subdomains after them.
- Deciding on one indicator. Look for several and confirm them with more stories.
- Calling the groups of a coarse story bounded contexts. They show subdomains; contexts are designed afterwards.
- Treating every group or context as a microservice right away.
- Drawing boundaries along today's systems. Boundary stories are pure for this reason.
- Boundaries that become walls between people who work together. The stories show where they collaborate; keep that collaboration easy.
- Mixing as-is and to-be, or pure and digitalized, in one boundary story.
- Drawing the map you wish for when asked for the map as it is.
- Message-flow pictures with too many messages.

## Sources

Summarized in our own words. The method and the indicators come from Stefan Hofer and Henning Schwentner: [domainstorytelling.org](https://domainstorytelling.org) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), their book "Domain Storytelling" (Addison-Wesley, 2022) and their talks on finding bounded contexts with Domain Storytelling. The relationship patterns follow Eric Evans' [DDD Reference](https://www.domainlanguage.com/ddd/reference/); the canvas and context-mapping advice follow the [DDD Crew](https://github.com/ddd-crew) repositories; the message-flow variant follows Nick Tune's Domain Message Flow Modelling. The bicycle shop examples are our own.
