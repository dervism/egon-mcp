# Examples

Complete, tested tool calls, from a first simple story to a family of stories about one business. Arguments are JSON. A block of `build_story` arguments stands for one call; a block of `{ "tool": ..., "arguments": ... }` lines is a sequence of calls. The `text` block after an example is what `narrate_story` returns for it, word for word. A test in `egon_mcp/test/skill-examples.test.ts` runs every block against the server, so these calls work as written.

Most examples share one domain, a bicycle repair shop, and show how a business is told as several stories at different scopes. The patterns behind them are explained in `modeling-patterns.md`.

The call sequences write the story id out for readability. In your own calls, use the `storyId` that `create_story`, `build_story` or `open_story` returns: it comes from the title, but is cut to 40 characters and gets a suffix if the id is taken.

## 1. A first story from a description

User: "When a customer calls to order a pizza, the clerk writes the order on a slip and hands it to the baker. The baker bakes it, and the clerk gives it to the customer, who pays."

```json
{
  "title": "Order pizza by phone",
  "description": "Coarse-grained, pure, as-is. Assumptions: happy path; the pizza is picked up, not delivered.",
  "scope": { "granularity": "coarse-grained", "pointInTime": "as-is", "domainPurity": "pure" },
  "sentences": [
    { "actor": "Customer", "activity": "orders", "workObject": "Pizza order", "workObjectIcon": "Call", "to": [{ "activity": "from", "actor": "Clerk" }] },
    { "actor": "Clerk", "activity": "writes", "workObject": "Order slip" },
    { "actor": "Clerk", "activity": "hands", "workObject": "Order slip", "to": [{ "activity": "to", "actor": "Pizza baker" }] },
    { "actor": "Pizza baker", "activity": "bakes", "workObject": "Pizza", "workObjectIcon": "Dining" },
    { "actor": "Clerk", "activity": "gives", "workObject": "Pizza", "to": [{ "activity": "to", "actor": "Customer" }] },
    { "actor": "Customer", "activity": "pays", "workObject": "Money", "workObjectIcon": "Euro", "to": [{ "activity": "to", "actor": "Clerk" }] }
  ],
  "annotations": [{ "text": "Card payment only on delivery", "attachTo": "Money" }]
}
```

```text
1. Customer orders Pizza order from Clerk.
2. Clerk writes Order slip.
3. Clerk hands Order slip to Pizza baker.
4. Pizza baker bakes Pizza.
5. Clerk gives Pizza to Customer.
6. Customer pays Money to Clerk.
```

Steps 2 and 3 each get their own "Order slip", and steps 4 and 5 their own "Pizza". That is how Domain Storytelling draws stories, and it keeps "to Pizza baker" out of step 2. Add `"reuseWorkObject": true` to a sentence to continue with the previous object of the same name instead. The assumptions that keep the story on one path go into the description.

## 2. The big picture: a coarse-grained story with subdomains

The first story about a new domain is usually coarse-grained: the whole case from start to end in about ten sentences, without detail. Groups cut it into areas of the business, which are candidates for subdomains.

```json
{
  "title": "Repair a bicycle",
  "description": "Coarse-grained, pure, as-is. Assumptions: happy path; the customer pays at the counter.",
  "scope": { "granularity": "coarse-grained", "pointInTime": "as-is", "domainPurity": "pure" },
  "actors": [{ "name": "Mechanic", "icon": "Person" }, { "name": "Supplier", "icon": "Business" }],
  "workObjects": [{ "name": "Spare part", "icon": "Settings" }],
  "sentences": [
    { "actor": "Customer", "activity": "brings", "workObject": "Bike", "workObjectIcon": "Bike", "to": [{ "activity": "to", "actor": "Mechanic" }] },
    { "actor": "Mechanic", "activity": "inspects", "workObject": "Bike", "workObjectIcon": "Bike" },
    { "actor": "Mechanic", "activity": "offers", "workObject": "Repair estimate", "workObjectIcon": "Receipt", "to": [{ "activity": "to", "actor": "Customer" }] },
    { "actor": "Customer", "activity": "gives", "workObject": "Approval", "workObjectIcon": "Thumb-up", "to": [{ "activity": "to", "actor": "Mechanic" }] },
    { "actor": "Mechanic", "activity": "orders", "workObject": "Spare part", "to": [{ "activity": "from", "actor": "Supplier" }] },
    { "actor": "Supplier", "activity": "delivers", "workObject": "Spare part", "to": [{ "activity": "to", "actor": "Mechanic" }] },
    { "actor": "Mechanic", "activity": "repairs", "workObject": "Bike", "workObjectIcon": "Bike" },
    { "actor": "Mechanic", "activity": "passes on", "workObject": "Repair report", "workObjectIcon": "Assignment", "to": [{ "activity": "to", "actor": "Cashier" }] },
    { "actor": "Customer", "activity": "pays", "workObject": "Repair price", "workObjectIcon": "Euro", "to": [{ "activity": "to", "actor": "Cashier" }] },
    { "actor": "Cashier", "activity": "hands over", "workObject": "Bike", "workObjectIcon": "Bike", "to": [{ "activity": "to", "actor": "Customer" }] }
  ],
  "groups": [
    { "name": "Repair", "members": ["Repair estimate", "Approval"] },
    { "name": "Purchasing", "members": ["Spare part", "Supplier"] },
    { "name": "Billing", "members": ["Repair report", "Repair price"] }
  ],
  "annotations": [{ "text": "Ordered parts usually arrive the next working day", "attachTo": "Spare part" }]
}
```

```text
1. Customer brings Bike to Mechanic.
2. Mechanic inspects Bike.
3. Mechanic offers Repair estimate to Customer.
4. Customer gives Approval to Mechanic.
5. Mechanic orders Spare part from Supplier.
6. Supplier delivers Spare part to Mechanic.
7. Mechanic repairs Bike.
8. Mechanic passes on Repair report to Cashier.
9. Customer pays Repair price to Cashier.
10. Cashier hands over Bike to Customer.
```

The declared `Supplier` gets a building icon and the declared `Spare part` the gear icon; every sentence that names them reuses those choices. A group named after an area of the business ("Purchasing") shows a subdomain, not yet a bounded context; see `ddd.md`.

## 3. Zooming in: a fine-grained story with two work objects per sentence

A fine-grained story shows how one part of the coarse story works, step by step. Sentences now often need a second work object ("writes Defects on Repair slip"). `build_story` cannot express that, so build the story call by call and connect the second work object with `add_activity`.

```json
{ "tool": "create_story", "arguments": { "title": "Estimate a bicycle repair", "description": "Fine-grained, pure, as-is. Assumption: one defect, parts in stock.", "scope": { "granularity": "fine-grained", "pointInTime": "as-is", "domainPurity": "pure" } } }
{ "tool": "add_sentence", "arguments": { "storyId": "estimate-a-bicycle-repair", "actor": "Mechanic", "activity": "test rides", "workObject": "Bike", "workObjectIcon": "Bike" } }
{ "tool": "add_sentence", "arguments": { "storyId": "estimate-a-bicycle-repair", "actor": "Mechanic", "activity": "writes", "workObject": "Defects", "workObjectIcon": "Problem" } }
{ "tool": "add_work_object", "arguments": { "storyId": "estimate-a-bicycle-repair", "name": "Repair slip", "icon": "Assignment" } }
{ "tool": "add_activity", "arguments": { "storyId": "estimate-a-bicycle-repair", "from": "Defects", "to": "Repair slip", "label": "on" } }
{ "tool": "add_sentence", "arguments": { "storyId": "estimate-a-bicycle-repair", "actor": "Mechanic", "activity": "looks up", "workObject": "Part prices", "workObjectIcon": "Euro" } }
{ "tool": "add_work_object", "arguments": { "storyId": "estimate-a-bicycle-repair", "name": "Price list", "icon": "View-List" } }
{ "tool": "add_activity", "arguments": { "storyId": "estimate-a-bicycle-repair", "from": "Part prices", "to": "Price list", "label": "in" } }
{ "tool": "add_sentence", "arguments": { "storyId": "estimate-a-bicycle-repair", "actor": "Mechanic", "activity": "adds up", "workObject": "Repair estimate", "workObjectIcon": "Receipt" } }
{ "tool": "add_sentence", "arguments": { "storyId": "estimate-a-bicycle-repair", "actor": "Mechanic", "activity": "explains", "workObject": "Repair estimate", "workObjectIcon": "Call", "to": [{ "activity": "to", "actor": "Customer" }] } }
{ "tool": "add_sentence", "arguments": { "storyId": "estimate-a-bicycle-repair", "actor": "Customer", "activity": "gives", "workObject": "Approval", "workObjectIcon": "Call", "to": [{ "activity": "to", "actor": "Mechanic" }] } }
{ "tool": "auto_layout", "arguments": { "storyId": "estimate-a-bicycle-repair" } }
```

```text
1. Mechanic test rides Bike.
2. Mechanic writes Defects on Repair slip.
3. Mechanic looks up Part prices in Price list.
4. Mechanic adds up Repair estimate.
5. Mechanic explains Repair estimate to Customer.
6. Customer gives Approval to Mechanic.
```

The repair estimate changes its medium in step 5: the mechanic explains it on the phone, so that copy gets the Call icon. Arrows that start at a work object carry no step number; they belong to the sentence of the arrow that leads into the work object.

## 4. The future: to-be and digitalized, with the change in color

Once the as-is stories are agreed, tell the same part as it should work with new software. Systems now act, and color marks what changes, so the before and after can be compared side by side.

```json
{
  "title": "Estimate a bicycle repair with the workshop app",
  "description": "Fine-grained, digitalized, to-be. Green marks what the workshop app changes.",
  "scope": { "granularity": "fine-grained", "pointInTime": "to-be", "domainPurity": "digitalized" },
  "actors": [{ "name": "Workshop app", "icon": "Tablet", "color": "#2E7D32" }],
  "workObjects": [{ "name": "Text message", "icon": "Cellphone", "color": "#2E7D32" }],
  "sentences": [
    { "actor": "Mechanic", "activity": "test rides", "workObject": "Bike", "workObjectIcon": "Bike" },
    { "actor": "Mechanic", "activity": "enters", "workObject": "Defects", "workObjectIcon": "Problem", "to": [{ "activity": "into", "actor": "Workshop app" }] },
    { "actor": "Workshop app", "activity": "calculates", "workObject": "Repair estimate", "workObjectIcon": "Receipt" },
    { "actor": "Workshop app", "activity": "sends", "workObject": "Text message", "to": [{ "activity": "to", "actor": "Customer" }] },
    { "actor": "Customer", "activity": "approves", "workObject": "Repair estimate", "workObjectIcon": "Thumb-up", "to": [{ "activity": "in", "actor": "Workshop app" }] }
  ],
  "groups": [{ "name": "new", "members": ["Workshop app", "Text message"], "color": "#2E7D32" }],
  "annotations": [{ "text": "Replaces the price list and the phone call", "attachTo": "Workshop app" }]
}
```

```text
1. Mechanic test rides Bike.
2. Mechanic enters Defects into Workshop app.
3. Workshop app calculates Repair estimate.
4. Workshop app sends Text message to Customer.
5. Customer approves Repair estimate in Workshop app.
```

## 5. A variant as its own story

Domain stories have no branches. An important alternative, such as the customer declining the estimate, becomes a story of its own with its assumption in the description. Small variations only get an annotation.

```json
{
  "title": "Repair a bicycle - customer declines",
  "description": "Coarse-grained, pure, as-is. Assumption: the customer finds the repair too expensive.",
  "scope": { "granularity": "coarse-grained", "pointInTime": "as-is", "domainPurity": "pure" },
  "sentences": [
    { "actor": "Customer", "activity": "brings", "workObject": "Bike", "workObjectIcon": "Bike", "to": [{ "activity": "to", "actor": "Mechanic" }] },
    { "actor": "Mechanic", "activity": "offers", "workObject": "Repair estimate", "workObjectIcon": "Receipt", "to": [{ "activity": "to", "actor": "Customer" }] },
    { "actor": "Customer", "activity": "declines", "workObject": "Repair estimate", "workObjectIcon": "Thumb-down" },
    { "actor": "Customer", "activity": "pays", "workObject": "Inspection fee", "workObjectIcon": "Euro", "to": [{ "activity": "to", "actor": "Cashier" }] },
    { "actor": "Cashier", "activity": "hands back", "workObject": "Bike", "workObjectIcon": "Bike", "to": [{ "activity": "to", "actor": "Customer" }] }
  ],
  "annotations": [{ "text": "Flat fee, also when the customer declines", "attachTo": "Inspection fee" }]
}
```

```text
1. Customer brings Bike to Mechanic.
2. Mechanic offers Repair estimate to Customer.
3. Customer declines Repair estimate.
4. Customer pays Inspection fee to Cashier.
5. Cashier hands back Bike to Customer.
```

## 6. Parallel steps and two actors working together

Two things that happen at the same time share a step number (`number` on the second sentence). When two actors work on the same work object together, both sentences use that one object (`reuseWorkObject`) and the same number.

```json
{
  "title": "Hand over a repaired bicycle",
  "description": "Fine-grained, pure, as-is.",
  "scope": { "granularity": "fine-grained", "pointInTime": "as-is", "domainPurity": "pure" },
  "sentences": [
    { "actor": "Cashier", "activity": "prints", "workObject": "Invoice", "workObjectIcon": "Receipt" },
    { "actor": "Mechanic", "activity": "cleans", "workObject": "Bike", "workObjectIcon": "Bike", "number": 1 },
    { "actor": "Customer", "activity": "pays", "workObject": "Invoice amount", "workObjectIcon": "Credit-Card", "to": [{ "activity": "to", "actor": "Cashier" }] },
    { "actor": "Customer", "activity": "signs", "workObject": "Handover form", "workObjectIcon": "Pencil" },
    { "actor": "Mechanic", "activity": "signs", "workObject": "Handover form", "reuseWorkObject": true, "number": 3 },
    { "actor": "Mechanic", "activity": "hands over", "workObject": "Bike", "workObjectIcon": "Bike", "to": [{ "activity": "to", "actor": "Customer" }] }
  ]
}
```

```text
1. Cashier prints Invoice. Mechanic cleans Bike.
2. Customer pays Invoice amount to Cashier.
3. Mechanic signs Handover form. Customer signs Handover form.
4. Mechanic hands over Bike to Customer.
```

`narrate_story` reads sentences that share a number in the order they are drawn, top to bottom and then left to right. `auto_layout` drew the Mechanic first, in step 1, so the Mechanic signs first in the read-back.

Use parallel numbers sparingly: they make a story harder to retell. If the order does not matter, agree on one order instead.

## 7. Several recipients and a second verb

A sentence can end at two recipients: label the first arrow with its preposition and the second "and". A continuation arrow can also carry a second verb, when both actions are one step.

```json
{
  "title": "Close a repair order",
  "description": "Fine-grained, pure, as-is.",
  "scope": { "granularity": "fine-grained", "pointInTime": "as-is", "domainPurity": "pure" },
  "sentences": [
    { "actor": "Cashier", "activity": "checks", "workObject": "Payment", "workObjectIcon": "Euro", "to": [{ "activity": "and confirms it to", "actor": "Mechanic" }] },
    { "actor": "Cashier", "activity": "sends", "workObject": "Invoice", "workObjectIcon": "Receipt", "to": [{ "activity": "to", "actor": "Customer" }, { "activity": "and", "actor": "Accountant" }] }
  ]
}
```

```text
1. Cashier checks Payment and confirms it to Mechanic.
2. Cashier sends Invoice to Customer and Accountant.
```

## 8. Something that repeats

There are no loops in a domain story. In a coarse story an annotation on the repeated sentence is enough ("for every bike"). In a medium-grained story like this one, a labeled group says which sentences repeat. In a fine-grained story you can spell out a concrete case, one sentence per round, which shows whether the rounds really are the same.

```json
{
  "title": "Service the rental fleet",
  "description": "Medium-grained, pure, as-is. Before the season starts.",
  "scope": { "granularity": "medium-grained", "pointInTime": "as-is", "domainPurity": "pure" },
  "actors": [{ "name": "Rental manager", "icon": "Person" }],
  "sentences": [
    { "actor": "Rental manager", "activity": "hands over", "workObject": "Service list", "workObjectIcon": "View-List", "to": [{ "activity": "to", "actor": "Mechanic" }] },
    { "actor": "Mechanic", "activity": "services", "workObject": "Rental bike", "workObjectIcon": "Bike" },
    { "actor": "Mechanic", "activity": "signs", "workObject": "Service log", "workObjectIcon": "Assignment" },
    { "actor": "Mechanic", "activity": "returns", "workObject": "Service list", "workObjectIcon": "View-List", "to": [{ "activity": "to", "actor": "Rental manager" }] }
  ],
  "groups": [{ "name": "repeated for each bike on the service list", "members": ["Rental bike", "Service log"] }],
  "annotations": [{ "text": "About 40 bikes", "attachTo": "Service list" }]
}
```

```text
1. Rental manager hands over Service list to Mechanic.
2. Mechanic services Rental bike.
3. Mechanic signs Service log.
4. Mechanic returns Service list to Rental manager.
```

## 9. Finding shadow IT

A digitalized as-is story makes every tool visible that people really use, including the spreadsheet nobody in IT knows about. Model it as an actor with a fitting icon and say where it lives.

```json
{
  "title": "Order spare parts",
  "description": "Fine-grained, digitalized, as-is.",
  "scope": { "granularity": "fine-grained", "pointInTime": "as-is", "domainPurity": "digitalized" },
  "actors": [{ "name": "Parts spreadsheet", "icon": "Table" }, { "name": "Supplier", "icon": "Business" }],
  "sentences": [
    { "actor": "Mechanic", "activity": "enters", "workObject": "Missing part", "workObjectIcon": "Settings", "to": [{ "activity": "into", "actor": "Parts spreadsheet" }] },
    { "actor": "Purchasing clerk", "activity": "copies", "workObject": "Order list", "workObjectIcon": "View-List", "to": [{ "activity": "from", "actor": "Parts spreadsheet" }] },
    { "actor": "Purchasing clerk", "activity": "emails", "workObject": "Order list", "workObjectIcon": "Email", "to": [{ "activity": "to", "actor": "Supplier" }] },
    { "actor": "Supplier", "activity": "confirms", "workObject": "Delivery date", "workObjectIcon": "Calendar", "to": [{ "activity": "to", "actor": "Purchasing clerk" }] }
  ],
  "annotations": [{ "text": "Excel file on the workshop PC; IT does not know it exists", "attachTo": "Parts spreadsheet" }]
}
```

```text
1. Mechanic enters Missing part into Parts spreadsheet.
2. Purchasing clerk copies Order list from Parts spreadsheet.
3. Purchasing clerk emails Order list to Supplier.
4. Supplier confirms Delivery date to Purchasing clerk.
```

## 10. Make or buy: a candidate product as its own to-be story

To compare off-the-shelf products, tell the same to-be story once per candidate and color the differences. Here the candidate has no price list, so the mechanic still looks up part prices by hand; only that work object is red. Compare it with example 4.

```json
{
  "title": "Estimate a bicycle repair with RepairDesk",
  "description": "Fine-grained, digitalized, to-be, candidate product RepairDesk. Red marks what it cannot do.",
  "scope": { "granularity": "fine-grained", "pointInTime": "to-be", "domainPurity": "digitalized" },
  "actors": [{ "name": "RepairDesk", "icon": "Desktop" }],
  "workObjects": [{ "name": "Part prices", "icon": "Euro", "color": "#C62828" }],
  "sentences": [
    { "actor": "Mechanic", "activity": "test rides", "workObject": "Bike", "workObjectIcon": "Bike" },
    { "actor": "Mechanic", "activity": "enters", "workObject": "Defects", "workObjectIcon": "Problem", "to": [{ "activity": "into", "actor": "RepairDesk" }] },
    { "actor": "Mechanic", "activity": "looks up", "workObject": "Part prices" },
    { "actor": "Mechanic", "activity": "enters", "workObject": "Repair estimate", "workObjectIcon": "Receipt", "to": [{ "activity": "into", "actor": "RepairDesk" }] },
    { "actor": "RepairDesk", "activity": "sends", "workObject": "Text message", "workObjectIcon": "Cellphone", "to": [{ "activity": "to", "actor": "Customer" }] },
    { "actor": "Customer", "activity": "approves", "workObject": "Repair estimate", "workObjectIcon": "Thumb-up", "to": [{ "activity": "in", "actor": "RepairDesk" }] }
  ],
  "annotations": [{ "text": "No price list; prices come from the supplier catalog", "attachTo": "RepairDesk" }]
}
```

```text
1. Mechanic test rides Bike.
2. Mechanic enters Defects into RepairDesk.
3. Mechanic looks up Part prices.
4. Mechanic enters Repair estimate into RepairDesk.
5. RepairDesk sends Text message to Customer.
6. Customer approves Repair estimate in RepairDesk.
```

A new copy of a work object takes the color of the previous one with the same name. To color one sentence only, give its work object a name of its own, as here, or color that copy afterwards with `update_element` and its id.

## 11. Messages between bounded contexts

The message-flow variant (after Nick Tune's Domain Message Flow Modeling) shows how bounded contexts talk to each other. Users, bounded contexts and other systems are actors; commands, events and queries are work objects; the arrows stay unlabeled, because the message already says what is meant; message contents go into annotations. `validate_story` warns about each unlabeled arrow and `narrate_story` shows a placeholder, both expected in this variant.

```json
{
  "title": "Place an order - message flow",
  "description": "Fine-grained, digitalized, to-be. Messages between bounded contexts, all items in stock. Cloud: bounded context; gear: system that is not a bounded context; envelope: command; flag: event.",
  "scope": { "granularity": "fine-grained", "pointInTime": "to-be", "domainPurity": "digitalized" },
  "actors": [
    { "name": "Shopper", "icon": "Person" },
    { "name": "Web shop", "icon": "Settings" },
    { "name": "Sales", "icon": "Cloud" },
    { "name": "Billing", "icon": "Cloud" },
    { "name": "Notifications", "icon": "Cloud" },
    { "name": "Payment provider", "icon": "Settings" }
  ],
  "sentences": [
    { "actor": "Shopper", "activity": "", "workObject": "Place order", "workObjectIcon": "Email", "to": [{ "actor": "Web shop" }] },
    { "actor": "Web shop", "activity": "", "workObject": "Place order", "workObjectIcon": "Email", "to": [{ "actor": "Sales" }] },
    { "actor": "Sales", "activity": "", "workObject": "Order placed", "workObjectIcon": "Flag", "to": [{ "actor": "Billing" }] },
    { "actor": "Billing", "activity": "", "workObject": "Charge card", "workObjectIcon": "Email", "to": [{ "actor": "Payment provider" }] },
    { "actor": "Billing", "activity": "", "workObject": "Payment collected", "workObjectIcon": "Flag", "to": [{ "actor": "Sales" }, { "actor": "Notifications" }] }
  ],
  "annotations": [
    { "text": "Order id, items, payment method, address", "attachTo": "Order placed" },
    { "text": "Customer id, card id, amount", "attachTo": "Charge card" }
  ]
}
```

```text
1. Shopper [unlabeled activity] Place order [unlabeled activity] Web shop.
2. Web shop [unlabeled activity] Place order [unlabeled activity] Sales.
3. Sales [unlabeled activity] Order placed [unlabeled activity] Billing.
4. Billing [unlabeled activity] Charge card [unlabeled activity] Payment provider.
5. Billing [unlabeled activity] Payment collected [unlabeled activity] Sales and [unlabeled activity] Notifications.
```

Modeling bounded contexts as actors, not as systems, keeps the decision open whether they become separate services.

## 12. Interview step by step

When the user tells the story as you go, add one sentence per answer and read it back.

```json
{ "tool": "create_story", "arguments": { "title": "Rent a car", "description": "Coarse-grained, pure, as-is. Happy path.", "scope": { "granularity": "coarse-grained", "pointInTime": "as-is", "domainPurity": "pure" } } }
{ "tool": "add_sentence", "arguments": { "storyId": "rent-a-car", "actor": "Customer", "activity": "shows", "workObject": "Driving licence", "to": [{ "activity": "to", "actor": "Agent" }] } }
{ "tool": "add_sentence", "arguments": { "storyId": "rent-a-car", "actor": "Agent", "activity": "checks", "workObject": "Driving licence" } }
{ "tool": "add_sentence", "arguments": { "storyId": "rent-a-car", "actor": "Agent", "activity": "hands over", "workObject": "Car key", "workObjectIcon": "Key", "to": [{ "activity": "to", "actor": "Customer" }] } }
{ "tool": "auto_layout", "arguments": { "storyId": "rent-a-car" } }
```

```text
1. Customer shows Driving licence to Agent.
2. Agent checks Driving licence.
3. Agent hands over Car key to Customer.
```

## 13. Improve a story someone else made

Open the file, check it, and fix what the review finds. Here the customer only says the order out loud, so its icon becomes a speech bubble, and "Money" becomes the word the shop uses.

```json
{ "tool": "list_story_files", "arguments": {} }
{ "tool": "open_story", "arguments": { "path": "Order pizza.egn" } }
{ "tool": "validate_story", "arguments": { "storyId": "order-pizza" } }
{ "tool": "update_element", "arguments": { "storyId": "order-pizza", "element": "Order", "icon": "Conversation" } }
{ "tool": "update_element", "arguments": { "storyId": "order-pizza", "element": "Money", "name": "Price" } }
{ "tool": "renumber_steps", "arguments": { "storyId": "order-pizza" } }
{ "tool": "save_story", "arguments": { "storyId": "order-pizza" } }
```

```text
1. Customer tells Order to Clerk.
2. Clerk writes Order slip for Pizza baker.
3. Pizza baker bakes Pizza for Customer.
4. Customer pays Price to Clerk.
```

`save_story` without a path writes back to `Order pizza.egn`, the file it came from.

## 14. Show it

```json
{ "tool": "create_story", "arguments": { "title": "Return a parcel", "description": "Coarse-grained, pure, as-is.", "scope": { "granularity": "coarse-grained", "pointInTime": "as-is", "domainPurity": "pure" } } }
{ "tool": "add_sentence", "arguments": { "storyId": "return-a-parcel", "actor": "Customer", "activity": "brings", "workObject": "Parcel", "to": [{ "activity": "to", "actor": "Post office clerk" }] } }
{ "tool": "open_in_egon", "arguments": { "storyId": "return-a-parcel", "startReplay": true } }
{ "tool": "save_story", "arguments": { "storyId": "return-a-parcel", "path": "Return a parcel.egn.svg" } }
```

Return the `egonUrl` from `open_in_egon` to the user. The `.egn.svg` file opens in any browser and imports back into Egon, which suits chats and documents.
