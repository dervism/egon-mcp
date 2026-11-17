# Examples

Complete tool calls for common requests. Arguments are JSON.

## A story from a description

User: "When a customer calls to order a pizza, the clerk writes the order on a slip and hands it to the baker. The baker bakes it, and the clerk gives it to the customer, who pays."

`build_story`:

```json
{
  "title": "Order pizza by phone",
  "description": "Happy path for a phone order",
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

Then `validate_story` with `{ "storyId": "order-pizza-by-phone" }`, `narrate_story` to read it back, and `save_story` to write `Order pizza by phone.egn`. The narrative reads:

```
1. Customer orders Pizza order from Clerk.
2. Clerk writes Order slip.
3. Clerk hands Order slip to Pizza baker.
4. Pizza baker bakes Pizza.
5. Clerk gives Pizza to Customer.
6. Customer pays Money to Clerk.
```

Steps 2 and 3 each get their own "Order slip", and steps 4 and 5 their own "Pizza". That is how Egon users draw stories, and it keeps "to Pizza baker" out of step 2. Add `"reuseWorkObject": true` to a sentence to continue with the previous object of the same name instead.

## Interview step by step

```json
{ "tool": "create_story", "arguments": { "title": "Rent a car", "scope": { "pointInTime": "as-is" } } }
{ "tool": "add_sentence", "arguments": { "storyId": "rent-a-car", "actor": "Customer", "activity": "shows", "workObject": "Driving licence", "to": [{ "activity": "to", "actor": "Agent" }] } }
{ "tool": "add_sentence", "arguments": { "storyId": "rent-a-car", "actor": "Agent", "activity": "checks", "workObject": "Driving licence" } }
{ "tool": "add_sentence", "arguments": { "storyId": "rent-a-car", "actor": "Agent", "activity": "hands over", "workObject": "Car key", "workObjectIcon": "Key", "to": [{ "activity": "to", "actor": "Customer" }] } }
{ "tool": "auto_layout", "arguments": { "storyId": "rent-a-car" } }
```

## Fix a story someone else made

```json
{ "tool": "list_story_files", "arguments": {} }
{ "tool": "open_story", "arguments": { "path": "stories/claims.egn" } }
{ "tool": "validate_story", "arguments": { "storyId": "claims" } }
{ "tool": "update_element", "arguments": { "storyId": "claims", "element": "connection_4821", "name": "submits" } }
{ "tool": "renumber_steps", "arguments": { "storyId": "claims" } }
{ "tool": "save_story", "arguments": { "storyId": "claims" } }
```

`save_story` without a path writes back to `stories/claims.egn`, the file it came from.

## Parallel steps

Two things happen at the same time in step 2:

```json
{ "tool": "add_sentence", "arguments": { "storyId": "s", "actor": "Clerk", "activity": "files", "workObject": "Invoice", "number": 2 } }
```

## Show it

```json
{ "tool": "open_in_egon", "arguments": { "storyId": "order-pizza-by-phone", "startReplay": true } }
```

Return the `egonUrl` to the user. For a picture in a chat or document, `save_story` with `"path": "Order pizza by phone.egn.svg"`; the file opens in any browser and imports back into Egon.
