# Modeling patterns

Each pattern says when to use it and how to build it with the egon-mcp tools. Sentences are written in the form `build_story` and `add_sentence` take, followed by what `narrate_story` reads back; a test builds every snippet. The numbers in brackets point to complete, tested examples in `examples.md`.

## Sentences

### Works on

The simplest sentence: an actor does something with a work object.

```json
{ "actor": "Mechanic", "activity": "inspects", "workObject": "Bike", "workObjectIcon": "Bike" }
```

```text
1. Mechanic inspects Bike.
```

(2)

### Hands over to someone

The work object goes to another actor, or the actor exchanges information about it with someone. The arrow to the recipient carries a small word: to, for, from, with.

```json
{ "actor": "Clerk", "activity": "hands", "workObject": "Order slip", "to": [{ "activity": "to", "actor": "Pizza baker" }] }
```

```text
1. Clerk hands Order slip to Pizza baker.
```

(1)

### Several recipients

List each recipient. Label the first arrow with its preposition and the others "and", as the book draws it.

```json
{ "actor": "Clerk", "activity": "sends", "workObject": "Invoice", "to": [{ "activity": "to", "actor": "Customer" }, { "activity": "and", "actor": "Accountant" }] }
```

```text
1. Clerk sends Invoice to Customer and Accountant.
```

(7)

### A second work object: works on w using v

When a sentence involves two things ("writes the defects on the repair slip", "fills out the warranty claim with data from the receipt"), draw both. Novices tend to hide the second object inside the verb; make it explicit. `build_story` cannot connect two work objects, so build those sentences call by call:

1. `add_sentence` for actor, verb and the first work object.
2. `add_work_object` for the second work object.
3. `add_activity` from the first to the second work object, labeled with the connecting word.

`add_activity` accepts names, as long as the name is unique at that moment. Work objects repeat per sentence, so in a longer story use the ids from the results of `add_sentence` and `add_work_object`. Arrows that start at a work object get no step number; they belong to the sentence that leads into the work object. (3)

### A second verb

A continuation arrow can carry a second verb phrase.

```json
{ "actor": "Mechanic", "activity": "test-rides", "workObject": "Bike", "workObjectIcon": "Bike", "to": [{ "activity": "and hands it back to", "actor": "Customer" }] }
```

```text
1. Mechanic test-rides Bike and hands it back to Customer.
```

Use it when the two actions are really one step. Otherwise tell two sentences. (7)

### Two actors on one work object

When two actors act on the same thing together (both sign, both agree), give both sentences the same number and let the second continue with the same object.

```json
{ "actor": "Customer", "activity": "signs", "workObject": "Handover form", "workObjectIcon": "Pencil" }
{ "actor": "Mechanic", "activity": "signs", "workObject": "Handover form", "reuseWorkObject": true, "number": 1 }
```

```text
1. Customer signs Handover form. Mechanic signs Handover form.
```

In a longer story, `number` is the number of the first sentence's step. (6)

### Parallel steps

Two things that happen at the same time share a number: pass the number of the earlier step as `number`. `narrate_story` reads such sentences in the order they were added. In a story drawn in Egon, whose ids are random, the order is arbitrary but stays the same. Use this sparingly, because parallel steps make a story harder to read and retell. If the order does not matter, agree on one order. (6)

## Work objects over time

### State changes: a new name

Every sentence gets its own work object, so a later copy can carry the new state in its name: "Repair estimate", then "Accepted estimate"; "Bike", then "Repaired bike". Do not reuse the old object when its meaning has changed.

### Medium changes: a new icon

The same thing can look different as the story goes on. A repair estimate explained on the phone gets the `Call` icon, the same estimate on paper the `Receipt` icon. Set `workObjectIcon` on the sentence where the medium changes. (3)

### Spoken information

When people only say something, the work object is the information, drawn as a speech bubble (`Conversation`), or `Call` for a phone call. "Customer tells Defects to Mechanic" uses a speech bubble; when the mechanic later writes the defects down, that copy gets a different icon.

### One thing turns into another

If an actor makes a new object out of another one ("Clerk turns Order into Invoice"), use a sentence for the first object and an `add_activity` from it to the second, labeled with the rest of the sentence ("into").

## Pure and digitalized

### A person uses a system

In a digitalized story, the system is the recipient of the person's action: "into", "in", "from".

```json
{ "actor": "Mechanic", "activity": "enters", "workObject": "Defects", "to": [{ "activity": "into", "actor": "Workshop app" }] }
```

```text
1. Mechanic enters Defects into Workshop app.
```

(4)

### A system acts

Systems can also be the actor of a sentence: "Workshop app sends Text message to Customer." Give systems a system or device icon (`System`, `Tablet`, `Desktop`) and keep the labels in the domain's words. (4)

### Shadow IT

Model every tool people really use, including spreadsheets, shared folders and private apps, as actors with a fitting icon (`Table` for a spreadsheet). Say in an annotation where it lives and who knows about it. (9)

## Assumptions, variations and repetition

### Assumptions

Assumptions that hold for the whole story ("happy path; the customer pays at the counter") go into the story's `description`. An assumption about one element goes into an annotation on that element. (1, 2, 5)

### Optional steps and small variations

Annotate the step ("optional", "only for business customers"), or draw a group labeled "optional" around its work objects. Small variations are not worth a story of their own.

### Important variants and error cases

Tell them as stories of their own, named after what differs ("Repair a bicycle - customer declines"), with the assumption that leads there in the description. (5)

### Repetition

- Coarse story: an annotation on the repeated sentence ("for every bike on the list").
- Medium-grained story: a group labeled "repeated for each ..." around the work objects of the repeated sentences. (8)
- Fine-grained story: spell out one concrete case, one sentence per round.

## Structure and change

### Subdomains, organizational boundaries and locations

To mark subdomains in a coarse story, group the sentences that belong together: `add_group` with `steps` (or `steps` in `build_story` groups) puts their work objects in and leaves the actors outside, since an actor usually works in several areas. Name the group after the work done in it ("Parts purchasing"), never after a work object. Groups for an organizational boundary or a location may hold actors too. (2) See `bounded-contexts.md`.

### What a to-be story changes

Color what is new or different (`color` on actors and work objects, or `update_element`), and add a group "new" or "will change". In the matching as-is story, a group "will change" marks the parts that the to-be story replaces. Explain the change in an annotation. (4)

A new copy of a work object takes the icon and color of the previous one with the same name. To color one sentence only, give its work object a name of its own, or color that copy afterwards with `update_element` and its id. (10)

### Make or buy

Tell one to-be story per candidate product, each with the product as an actor, and color what the candidate cannot do or does differently. Compare the stories with the user. (10)

### A family of stories

A domain is told as several stories. A good set for one business:

1. One coarse, pure, as-is story of the standard case, grouped into areas. (2)
2. Fine-grained stories for the parts that matter. (3)
3. Variants and error cases as their own stories. (5)
4. To-be stories, pure and then digitalized, with the changes in color. (4, 10)

Name each story after its case and put the scope into its description. Egon 3 takes the title from the file name, so keep the file name equal to the title.

### Messages between bounded contexts

To show how bounded contexts communicate, use the message-flow variant: users, bounded contexts and systems as actors, commands, events and queries as work objects, arrows without labels, message contents in annotations. (11) See `bounded-contexts.md`.

## Annotations worth adding

- Definitions of domain terms ("Credit rating: a letter from A to D").
- Rules and their reasons ("Must exist before the vote can be entered").
- Frequencies and volumes ("every Thursday", "about 40 bikes").
- Where something lives ("Excel file on the workshop PC").
- Open questions and unresolved disagreements, so everyone sees them.
- Details that came up when the story was retold, attached to the sentence they belong to.
