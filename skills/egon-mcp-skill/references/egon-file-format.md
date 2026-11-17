# Egon file format

The egon-mcp tools read and write these files for you. This reference is for when you need to inspect a file, explain one to a user, or repair one by hand.

## File types

| Extension | Content |
|---|---|
| `.egn` | JSON with the story and its icon set. Egon's own save format. |
| `.egn.svg` | An SVG picture with the `.egn` JSON embedded. Egon can import it, and any image viewer can show it. |
| `.dst`, `.dst.svg` | The same from Egon 1.x and 2.x. Read-only for egon-mcp. |

## Layouts

Egon 3 (the public app at egon.io, version 3.2.1) writes and reads:

```json
{
  "domain": { "name": "default", "actors": { "Person": "<svg ...>" }, "workObjects": { "Document": "<svg ...>" } },
  "dst": [
    { "type": "domainStory:actorPerson", "id": "shape_1234", "name": "Customer", "x": 100, "y": 100 },
    { "info": "description of the story" },
    { "version": "3.2.1" }
  ]
}
```

The title is not in the file. Egon takes it from the file name, minus the extension and a date suffix such as `_2024-05-06`. Scope is not stored.

Egon 4 (unreleased, on egon.io's `main` branch) writes:

```json
{
  "iconSet": { "name": "default", "actors": {}, "workObjects": {} },
  "domainStory": { "businessObjects": [], "title": "Order pizza", "description": "", "version": "4.0.0", "scope": { "pointInTime": "as-is" } }
}
```

Egon 4 also reads the Egon 3 layout, so egon-mcp writes Egon 3 by default. Start the server with `--egon-format egon4` to keep title and scope inside the file.

In `.egn.svg` files the JSON sits in a comment after `</svg>`: `<!-- <DST> {...} </DST> -->`. Egon 3 finds it by the literal `<DST>` marker.

## Element types

| Type | Fields Egon needs |
|---|---|
| `domainStory:actor<Icon>`, for example `domainStory:actorPerson` | `id`, `name`, `x`, `y` (top-left corner). Size defaults to 75x75. |
| `domainStory:workObject<Icon>`, for example `domainStory:workObjectDocument` | Same as actors. |
| `domainStory:activity` | `id`, `name` (must be a string), `source`, `target`, `waypoints` (at least two `{x, y}`), `number` (integer for activities from an actor, else `null`). |
| `domainStory:group` | `id`, `name`, `x`, `y`, `width`, `height`. Members point to the group with `parent: "<group id>"`. |
| `domainStory:textAnnotation` | `id`, `text`, `x`, `y`, `width`, `height`. |
| `domainStory:connection` | Dashed line from an element to an annotation: `id`, `source`, `target`, `waypoints`. |

Other details:

- Ids look like `shape_1234` and `connection_1234` and must be valid CSS identifiers.
- `pickedColor` holds an optional color such as `#E53935`.
- `multipleNumberAllowed: true` marks activities that share a step number.
- The `<Icon>` part must be a built-in Egon icon or a key in the file's icon set. Spaces in icon names become dashes.
- Egon draws activities from the waypoints in the file and does not recompute them, so moved shapes need new waypoints. `update_element` and `auto_layout` take care of that.
- Egon's import drops activities whose `source` or `target` does not exist, and it can fail on more than one. `validate_story` reports these as `dangling-reference`.

## Rules Egon enforces when editing

- No activity between two actors, no activity into a group, no activity from an element to itself.
- Activities from a work object never carry a number.
- An arrow to a text annotation is a `domainStory:connection`, never an activity.
