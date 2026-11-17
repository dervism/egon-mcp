---
name: egon-mcp-skill
description: Model, edit, check and render Domain Storytelling diagrams for Egon.io through the egon-mcp MCP server. Use when the user wants a domain story or Domain Storytelling diagram, mentions Egon or .egn / .egn.svg files, wants a business process, workshop or interview turned into a story, wants as-is and to-be or pure and digitalized versions of a process, wants subdomains, bounded contexts or requirements derived from stories, or wants an existing story reviewed, fixed, exported or opened in Egon.
---

# Egon MCP skill

Domain Storytelling is a collaborative modeling method by Stefan Hofer and Henning Schwentner. Domain experts tell how they work, one concrete case at a time, and the story is drawn while they talk with a small picture language of actors, work objects and numbered activities. The point is the conversation: the picture lets everyone see at once whether the listener understood.

The egon-mcp server creates and edits these stories in the file format of [Egon.io](https://egon.io), the Domain Storytelling modeler. It can also check stories, read them back as sentences, render them as SVG, and open them in the Egon web app.

Tool names below are the server's own. Your client may prefix them, for example `mcp__egon__build_story`.

## Before you start

- Check that the egon-mcp tools are available (look for `build_story`). If they are not, tell the user to register the server; the repository README shows the configuration.
- File tools only see one directory, the workspace root the server was started with. Paths you pass are relative to it. `list_story_files` shows what is there, and `save_story` reports the root it wrote to.
- Stories are held in memory by `storyId` until you save them. Nothing reaches the disk without `save_story`.

## Pick the workflow

| The user wants | Do this |
|---|---|
| A story from a process description | Settle scope and scenario (next section), write the sentences, call `build_story`, then `validate_story` and `narrate_story`. Save with `save_story`. |
| To tell the story step by step | Use the `domain_story_interview` prompt, or `create_story` plus one `add_sentence` per answer, read back after each. |
| To understand a whole new domain | Start with one coarse-grained, pure, as-is story of the most common case. Then zoom into its parts with fine-grained stories, and tell important variants as stories of their own. |
| To design new software or a new process | Agree on the as-is stories first, then tell to-be stories, pure or digitalized, and color what changes. |
| Subdomains, bounded contexts, a ubiquitous language | Group a coarse story into areas of the business and read `references/ddd.md`. |
| Requirements or user stories | Tell digitalized to-be stories and derive user stories from the sentences in which the software takes part; see `references/ddd.md`. |
| To compare candidate products, or find shadow IT | Tell digitalized stories: one to-be story per candidate, or an as-is story with every tool people really use. |
| To change an existing file | `list_story_files`, `open_story`, `get_story`, then the edit tools, `validate_story`, `save_story`. |
| A review of a story | The `review_domain_story` prompt, or `validate_story` plus `narrate_story` and the checks below. |
| To see the story | `open_in_egon` for the live app, `export_story` with `svg` for an image, or `save_story` to an `.egn.svg` file. |
| A story pasted as text | `import_story` with the content and the original file name. |

`references/examples.md` has complete, tested call sequences for most of these.

## Decide scope and scenario first

Every story is one concrete case, told at one level. Settle both before the first sentence.

Scope has three factors. Set them with the `scope` argument of `create_story` or `build_story`, and say them in the description too, because the public egon.io app does not store scope in the file.

- Granularity: `coarse-grained` stories give the big picture of a whole case in about ten sentences and say what happens; `fine-grained` stories show one part in detail and say how; `medium-grained` sits between.
- Point in time: `as-is` tells how work happens today, `to-be` how it should happen.
- Domain purity: `pure` stories show only people, groups and organizational units; `digitalized` stories also show software systems as actors.

Pick the scenario like this:

1. Ask which case is the most common one, and model that first: the normal case, the happy path. If no case is typical, model a few real past cases from simple to difficult.
2. Write down the assumptions that keep the story on that one path ("happy path; the customer pays at the counter") in the story's description. Notes about a single element go into annotations.
3. Keep stories to about 10 to 20 steps. Split longer processes into several stories and say how they connect.
4. Name the story after its case, and name variants after what differs: "Repair a bicycle", "Repair a bicycle - customer declines".

A typical order for a new domain: coarse as-is pure story first, then fine-grained stories for the parts that matter, then to-be stories once everyone agrees on today. `references/domain-storytelling.md` explains scope in more depth.

## Turn a process into sentences

A domain story is a numbered list of sentences: who (actor) does what (activity) with what (work objects) with whom (other actors). In `build_story` and `add_sentence`:

```json
{ "actor": "Customer", "activity": "tells", "workObject": "Order",
  "to": [{ "activity": "to", "actor": "Clerk" }] }
```

```text
1. Customer tells Order to Clerk.
```

The activity from the actor carries the step number; the arrows after the work object carry the small words (to, for, in, from, with) and no number.

| Sentence | Example | How to build it |
|---|---|---|
| A works on w | Mechanic inspects Bike. | A sentence without `to`. |
| A works on w using v | Mechanic writes Defects on Repair slip. | `add_sentence` for the first part, then `add_work_object` for v and `add_activity` from w to v with the small word. |
| A hands over w to B | Clerk hands Order slip to Pizza baker. | `to` with one recipient. |
| A hands over w to B and C | Clerk sends Invoice to Customer and Accountant. | `to` with two recipients, labeled "to" and "and". |
| A and B work on w together | Customer signs Handover form. Mechanic signs Handover form. | Two sentences with the same `number`, the second with `reuseWorkObject: true`. |
| A does something in a system | Mechanic enters Defects into Workshop app. | `to` with the system as recipient, in a digitalized story. |

Rules for good sentences:

1. Actors are people, roles, teams, organizational units, and in digitalized stories systems. Work objects are what they create, use and pass on: documents, physical things, digital objects, and information about them. Actors and work objects are nouns, activities are verbs.
2. Two actors never connect directly. Egon refuses it. Name what they exchange: a call, a message, a form, the spoken information.
3. Every sentence starts with an actor. When the user says "then you check it" or "it gets approved", ask who does it.
4. Use the domain's own words, in the present tense, and the same name for the same thing in every sentence. Never translate them into technical terms.
5. Each actor appears once; each sentence gets its own work objects. Actors with the same name are one element. Work objects are drawn again in each sentence, as Domain Storytelling recommends, so a recipient in step 3 does not leak into step 1. Set `reuseWorkObject: true`, or pass the work object's id, when a sentence should continue with the very same object. A new copy takes the icon and color of the previous one with the same name, so give a copy its own name, or recolor it by id with `update_element`, when only that copy should look different.
6. When a work object changes its state, give the new copy a new name ("Repair estimate" becomes "Accepted estimate"). When it changes its medium, give it a new icon (an email becomes a printout). Information that is only spoken gets the `Conversation` icon; a phone call gets `Call`.
7. Label everything: every actor, work object and activity. Leave an arrow unlabeled only when the sentence reads naturally without a word.
8. Do not branch. Tell one case. Important alternatives become stories of their own; small variations and optional steps become annotations.
9. Show repetition without loops: an annotation in a coarse story ("for every line item"), a labeled group in a medium-grained one, or one sentence per round of a concrete case in a fine-grained one.
10. Use the same step number for things that really happen in parallel, and use it sparingly.

`references/modeling-patterns.md` explains these patterns with the tool calls for each, and `references/domain-storytelling.md` covers the method behind them.

## Pure and digitalized stories

- In a pure story only people act. The mechanic "writes" the repair slip, and the parts list is a notebook. Pure stories show the business itself and are where most domain stories start.
- In a digitalized story systems are actors, and people use them: "Mechanic enters Defects into Workshop app", "Workshop app sends Text message to Customer". Model every tool people really use, including spreadsheets and shared folders, and say in an annotation where it lives. This is how hidden shadow IT shows up.
- Keep the labels in the domain's words in both. A digitalized story says "enters the order", not "POSTs a JSON payload".

## Annotations, groups and color

- Annotations hold what the sentences cannot: variations, optional steps, rules, definitions of domain terms, frequencies ("every Thursday"), where something lives, open questions and disagreements. Attach each one to the element it is about with `add_annotation`.
- Groups (`add_group`) draw a labeled box around elements that belong together: subdomains, organizational boundaries, locations, optional parts, repeated parts, or what a to-be story changes. Always give a group a name that says what it means. A group fitted around `members` holds only them. A box drawn with `x`, `y`, `width` and `height` takes in every shape whose top-left corner lies inside it, as a box drawn in Egon does; a shape added or moved into a box joins the group, and moving a group moves what is in it. A group without members or position goes below the story. A note goes with the element it is attached to. A file only records who is in a group, so `open_story` puts any shape that lies in a group's box but has no group into that group; Egon itself only reads who is in a group and leaves such a shape outside.
- Color (`color` on actors, work objects and groups, or `update_element`) marks differences, typically what is new or changes in a to-be story.

## Choose icons

- Actors: `Person` (default), `Group` for teams or departments, `System` or a device icon such as `Tablet` or `Desktop` for software, `Business` or `Store` for an organization. Other built-in icons such as `Car` or `World` also work for actors.
- Work objects: `Document` (default). A new element whose name matches a built-in icon gets that icon automatically, so an "Email" work object gets the Email icon.
- Call `search_icons` with the thing's name or a related word ("invoice", "delivery", "money") and use the returned name. Unknown icon names fail with suggestions.
- Keep the set small and distinct, and never use the same icon for an actor and a work object in one story. If nothing fits, `add_custom_icon` with a small 24x24 SVG, then use its name.

## Check the result

Run `validate_story` after building or editing. Fix every error; the file would not import into Egon or would draw wrong. Then look at the warnings:

- `unnamed-element`, `unlabeled-activity`: add the missing name or word with `update_element`, unless the sentence reads naturally without it.
- `unconnected-element`: connect it or remove it. Parts of a story that do not connect are often a gap in the story; ask the user why.
- `numbering-gap`: call `renumber_steps`.
- `overlapping-shapes`, `overlapping-groups`: call `auto_layout`, which keeps the members of each group together in a block of their own.
- `group-encloses-non-member`: decide whether the element belongs in the group. If it does, set its `x` and `y` with `update_element` (its current position will do): a shape placed in a box joins the group. If not, call `auto_layout`, which moves it out of the box. Left as it is, it joins the group when `open_story` opens the saved file; `save_story` lists such changes in `groupChangesOnOpen`.

Then read `narrate_story` and compare it with what the user said. Each line must read as a correct sentence. Show the user the numbered sentences and retell the whole story from the start: is anything missing, is anything wrong, do all the experts agree? Retelling is where forgotten details come up; put them on the sentence they belong to.

## Run a workshop or an interview

When the user knows the domain but has no description yet, you are the moderator and the modeler. The `domain_story_interview` prompt sets this up.

- Ask for one concrete case and its storyteller, then let them tell it in order. Keep it going with "What happens next?", "Where do you get this information?", "How do you decide what to do next?" and "How do you do that?"
- Add each sentence as it is told, then retell it with their terms and ask "Is this the right term?". Do not push your own words or opinion.
- Ask why when a step seems to lack a purpose. When the answer is habit, a guess about what another department needs, or a limit of the current software, you have often found a real problem.
- At the end, retell the story and go through the annotations: let the user decide which variations deserve a story of their own.

`references/domain-storytelling.md` covers preparing a workshop, the roles in it, and more questions.

## Beyond one story

- Domain-Driven Design: the labels of a story are the start of the ubiquitous language; groups in a coarse story mark subdomains, which are candidates for bounded contexts; message flows between bounded contexts can be modeled as a story variant. See `references/ddd.md`.
- Requirements: a sentence of a digitalized to-be story in which the software takes part can become a user story (actor as role, activity and work object as want, the step it enables as benefit). This is a heuristic; see `references/ddd.md`.
- Change: as-is and to-be stories with the changes in color show people how their work will change; one to-be story per candidate product compares off-the-shelf systems.

## Edit precisely

- `get_story` lists every element with its id, name, icon and step number. Pass either the id or the exact name to other tools. Work objects repeat per sentence, so use the id when a name appears more than once; `add_group` and `add_annotation` also accept such a name (all of them, or the first one). When an actor or work object shares its name with a group or annotation, `add_group`, `add_annotation` and `add_activity` take the name to mean the actor or work object; `update_element` and `remove_element` call it ambiguous and need the id.
- `update_element` renames, recolors, changes icons, moves shapes, edits annotation text, and moves an activity to another step (`number`; later steps shift).
- `remove_element` on an actor or work object also removes its activities and closes the gaps in the numbering.
- Shapes added without coordinates go on a grid. After many edits, `auto_layout` tidies the whole story and reroutes the arrows.

## Save and show

- `save_story` without a path writes back to the file the story came from, or to `<title>.egn`. The extension picks the format: `.egn` (Egon file), `.egn.svg` (picture that Egon can import), `.svg` (picture only), `.md` (sentences). Legacy `.dst` files can be opened but not written.
- `save_story` only replaces a file that this story opened or wrote and that nobody changed since, not even another story. Ask the user before passing `overwrite: true`.
- Egon 3 (the public app) reads the title from the file name, so keep the file name equal to the title. Scope survives only in the Egon 4 layout: pass `layout: "egon4"` to `save_story`, or run the server with `--egon-format egon4`. A story saved back to its own file keeps the layout it last opened or saved it with, and replacing any other Egon file keeps that file's layout.
- `open_in_egon` returns an Egon link that loads the story from the running server. Give the user the `egonUrl`. The link works only on the same machine while the server runs, and it always shows the latest state, so edits only need a reload. Egon's replay (`startReplay`) walks through the story sentence by sentence, which is a good way to review it with the user.
- If the browser blocks the local link (Chrome may ask for local network access; some browsers refuse), save the story and tell the user to use "Import file" in Egon.
- Image formats: `export_story` with `svg` returns the SVG text, which you can write to a file or show if the client renders SVG.

## When something fails

Tool errors explain the problem and usually the fix:

| Message contains | What to do |
|---|---|
| `two actors` | Insert the work object they exchange. |
| `ambiguous` | Several elements share the name; use the id from `get_story`. |
| `no element with the id or name` | Check spelling with `get_story`. |
| `Unknown icon` | Pick one of the suggested names or call `search_icons`. |
| `outside the workspace root`, `symbolic link` | Use a plain path relative to the root; ask the user to move the file or restart the server with another `--root`. |
| `already exists` | Pick another path, or ask the user whether to pass `overwrite: true`. |
| `was saved by story` | Another open story saved the file after this one read it. Compare the two with `get_story`, save from the one to keep, or ask the user before passing `overwrite: true`. |
| `not a regular file` | The path is a folder, pipe or device. Pick a path to a plain file. |
| `cannot be read` | A file this story opened or wrote is now unreadable or too large to check. Ask the user, then save elsewhere or pass `overwrite: true`. |
| `changed on disk` | The file was edited or replaced outside the server, or by a story that is closed now. Tell the user, then reopen it with `open_story`, save elsewhere, or pass `overwrite: true` if they agree to lose those changes. |
| `No open story` | Use `list_stories`; stories are lost when the server restarts unless saved. |

## References

- `references/examples.md`: tested tool calls, from a first story to a family of stories about one business.
- `references/modeling-patterns.md`: sentence structures and modeling patterns, each with the tool calls that build it.
- `references/domain-storytelling.md`: the method: notation, scenarios, scope, style, workshops and what the method is used for.
- `references/ddd.md`: Domain-Driven Design and requirements: ubiquitous language, subdomains, bounded contexts, message flows, user stories.
- `references/egon-file-format.md`: the `.egn` layouts, element types and what Egon requires, for reading or repairing files by hand.
- `references/tools.md`: every tool with its parameters, generated from the server.
