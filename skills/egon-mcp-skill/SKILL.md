---
name: egon-mcp-skill
description: Model, edit, check and render Domain Storytelling diagrams for Egon.io through the egon-mcp MCP server. Use when the user wants a domain story or Domain Storytelling diagram, mentions Egon or .egn / .egn.svg files, wants a business process, workshop or interview turned into a story, or wants an existing story reviewed, fixed, exported or opened in Egon.
---

# Egon MCP skill

The egon-mcp server creates and edits domain stories in the file format of [Egon.io](https://egon.io), the Domain Storytelling modeler. It can also check stories, read them back as sentences, render them as SVG, and open them in the Egon web app.

Tool names below are the server's own. Your client may prefix them, for example `mcp__egon__build_story`.

## Before you start

- Check that the egon-mcp tools are available (look for `build_story`). If they are not, tell the user to register the server; the repository README shows the configuration.
- File tools only see one directory, the workspace root the server was started with. Paths you pass are relative to it. `list_story_files` shows what is there, and `save_story` reports the root it wrote to.
- Stories are held in memory by `storyId` until you save them. Nothing reaches the disk without `save_story`.

## Pick the workflow

| The user wants | Do this |
|---|---|
| A story from a process description | Write the sentences, call `build_story`, then `validate_story` and `narrate_story`. Save with `save_story`. |
| To tell the story step by step | Use the `domain_story_interview` prompt, or `create_story` plus one `add_sentence` per answer. |
| To change an existing file | `list_story_files`, `open_story`, `get_story`, then the edit tools, `validate_story`, `save_story`. |
| A review of a story | The `review_domain_story` prompt, or `validate_story` plus `narrate_story` and the checklist below. |
| To see the story | `open_in_egon` for the live app, `export_story` with `svg` for an image, or `save_story` to an `.egn.svg` file. |
| A story pasted as text | `import_story` with the content and the original file name. |

## Turn a process into sentences

A domain story is a numbered list of sentences. Each sentence has an actor, a verb, a work object, and optionally the actors who receive the work object:

```
1. Customer tells Order to Clerk.
2. Clerk writes Order slip for Pizza baker.
3. Pizza baker bakes Pizza.
```

In `build_story` and `add_sentence` that is:

```json
{ "actor": "Customer", "activity": "tells", "workObject": "Order",
  "to": [{ "activity": "to", "actor": "Clerk" }] }
```

Rules to follow while you write the sentences:

1. Actors do things: people, roles, groups, systems. Work objects are what they work with: documents, calls, emails, money, goods, information.
2. Never connect two actors. Egon refuses it. Name the work object they exchange instead, such as a call, a message or a form ("Customer calls Waiter" becomes "Customer orders Pizza from Waiter", or uses a Call work object).
3. Tell one concrete case, usually the happy path. Put variations, rules and open questions into annotations, or into a second story. Do not branch.
4. Use the domain's words, in the present tense, and the same name for the same thing in every sentence. `build_story` matches names case-insensitively, so "order" and "Order" become one element.
5. Keep stories to about 10 to 20 steps. Split longer processes into several stories and say how they connect.
6. Use the same step number for things that happen in parallel (`number` on `add_sentence` or `add_activity`).
7. A work object can turn into another one ("Clerk turns Order into Invoice"). Use `add_activity` from the first work object to the second for that.

For more on the method, scope levels and interview questions, read `references/domain-storytelling.md`.

## Choose icons

- Actors: `Person` (default), `Group` for teams or departments, `System` for software. Other built-in icons such as `Car` or `World` also work for actors.
- Work objects: `Document` (default). A new element whose name matches a built-in icon gets that icon automatically, so an "Email" work object gets the Email icon.
- Call `search_icons` with the thing's name or a related word ("invoice", "delivery", "money") and use the returned name. Unknown icon names fail with suggestions.
- If nothing fits, `add_custom_icon` with a small 24x24 SVG, then use its name.

## Check the result

Run `validate_story` after building or editing. Fix every error; the file would not import into Egon or would draw wrong. Then look at the warnings:

- `unnamed-element`, `unlabeled-activity`: add the missing name or verb with `update_element`.
- `unconnected-element`: connect it or remove it.
- `numbering-gap`: call `renumber_steps`.
- `overlapping-shapes`: call `auto_layout`.

Then read `narrate_story` and compare it with what the user said. Each line must read as a correct sentence. Show the user the numbered sentences; they are easier to check than coordinates.

## Edit precisely

- `get_story` lists every element with its id, name, icon and step number. Pass either the id or the exact name to other tools.
- `update_element` renames, recolors, changes icons, moves shapes, edits annotation text, and moves an activity to another step (`number`; later steps shift).
- `remove_element` on an actor or work object also removes its activities and closes the gaps in the numbering.
- `add_group` draws a box around members (for departments or subdomains). `add_annotation` attaches a note.
- Shapes added without coordinates go on a grid. After many edits, `auto_layout` tidies the whole story and reroutes the arrows.

## Save and show

- `save_story` without a path writes `<title>.egn`. The extension picks the format: `.egn` (Egon file), `.egn.svg` (picture that Egon can import), `.svg` (picture only), `.md` (sentences).
- Egon 3 (the public app) reads the title from the file name, so keep the file name equal to the title. Scope survives only when the server runs with `--egon-format egon4`.
- `open_in_egon` returns an Egon link that loads the story from the running server. Give the user the `egonUrl`. The link works only on the same machine while the server runs, and it always shows the latest state, so edits only need a reload.
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
| `outside the workspace root` | Use a path relative to the root; ask the user to move the file or restart the server with another `--root`. |
| `No open story` | Use `list_stories`; stories are lost when the server restarts unless saved. |

## References

- `references/tools.md`: every tool with its parameters, generated from the server.
- `references/domain-storytelling.md`: the method, scope, and how to run an interview.
- `references/egon-file-format.md`: the `.egn` layouts, element types and what Egon requires, for reading or repairing files by hand.
- `references/examples.md`: complete tool calls for common requests.
