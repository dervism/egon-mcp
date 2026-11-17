# egon-mcp tool reference

Generated from the server with `npm run docs` in `egon_mcp`. Do not edit by hand.

[create_story](#create_story) · [build_story](#build_story) · [open_story](#open_story) · [import_story](#import_story) · [list_stories](#list_stories) · [close_story](#close_story) · [save_story](#save_story) · [list_story_files](#list_story_files) · [get_story](#get_story) · [narrate_story](#narrate_story) · [validate_story](#validate_story) · [set_story_info](#set_story_info) · [add_actor](#add_actor) · [add_work_object](#add_work_object) · [add_activity](#add_activity) · [add_sentence](#add_sentence) · [add_group](#add_group) · [add_annotation](#add_annotation) · [update_element](#update_element) · [remove_element](#remove_element) · [renumber_steps](#renumber_steps) · [auto_layout](#auto_layout) · [add_custom_icon](#add_custom_icon) · [search_icons](#search_icons) · [list_icons](#list_icons) · [export_story](#export_story) · [open_in_egon](#open_in_egon)

## create_story

Creates a new, empty domain story with Egon's default icon set and returns its storyId. Use build_story instead to create a whole story from sentences in one call.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Story title. Egon 3 reads the title from the file name, so saved files are named after it. |
| `description` | string | no | Text Egon shows under the title. |
| `scope` | object {granularity?, pointInTime?, domainPurity?} | no | Scope of the story as shown in Egon's properties panel. |

## build_story

Creates a complete domain story in one call from numbered sentences ("Customer tells Order to Clerk"), then lays it out. Each sentence becomes one step, except that sentences given the number of an earlier step share it. Actors with the same name are one element. Each sentence draws its own work object, except that the first sentence naming a declared work object uses it and reuseWorkObject continues the previous one. Returns the storyId, the narrative and any validation issues.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Story title. Egon 3 reads the title from the file name, so saved files are named after it. |
| `description` | string | no | Text Egon shows under the title. |
| `scope` | object {granularity?, pointInTime?, domainPurity?} | no | Scope of the story as shown in Egon's properties panel. |
| `actors` | array of object {name, icon?, color?} | no | Actors to create first, to choose their icon or color. |
| `workObjects` | array of object {name, icon?, color?} | no | Work objects to create first, to choose their icon or color. The first sentence that names one uses it, and a workObjectIcon on that sentence replaces its icon; later sentences draw new ones with the same icon and color. |
| `sentences` | array of object {actor, actorIcon?, activity, workObject, workObjectIcon?, reuseWorkObject?, to?, number?} | yes | The steps of the story in order. |
| `groups` | array of object {name, members?, steps?, color?} | no | Boxes around elements that belong together, by members or by steps as add_group takes them, in any order: a group named in another group's members is added first, and a group by steps takes in every group by steps whose steps are all among its own. |
| `annotations` | array of object {text, attachTo?} | no | Notes for variations, rules and open questions. |
| `layout` | boolean | no | Arrange elements automatically (default true). |

## open_story

Opens an Egon story file (.egn, .egn.svg, or legacy .dst / .dst.svg) from the workspace directory and returns its storyId.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path relative to the workspace root, as listed by list_story_files. |

## import_story

Opens a story from the text of an .egn, .dst or .egn.svg file, for example one the user pasted. Use open_story for files in the workspace.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | yes | The full file content. |
| `fileName` | string | no | Original file name; decides how the content is read and gives the title for old files. |

## list_stories

Lists the stories open in this session with their storyId, title, file path, size and whether they have unsaved changes.

No parameters.

## close_story

Closes an open story without saving it. Save first with save_story if it has unsaved changes.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |

## save_story

Writes a story into the workspace directory. For .egn and .egn.svg files it opens the written file the way open_story would: groupChangesOnOpen lists the group changes that would make, such as a shape in no group joining the smallest group box over its top-left corner, and reopenError says why the file would not open. Egon itself only reads who is in a group. The extension picks the format: .egn (Egon file), .egn.svg (image with the story embedded, importable by Egon), .svg (image only) or .md (narrative). Without a path the story goes back to the file it was opened from, or to "<title>.egn". An existing file is only replaced if this story opened or wrote it and nobody changed it since, or with overwrite: true.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `path` | string | no | Target path relative to the workspace root. |
| `overwrite` | boolean | no | Replace an existing file that this story did not open or write, or that changed since it did. Ask the user first. |
| `layout` | `egon3` \| `egon4` | no | .egn layout: egon3 works in egon.io 3.x and Egon 4; egon4 also keeps title and scope. Default: when saving back to the file the story came from or was last saved to, the layout it last had there; else the layout of the Egon file being replaced; else the server setting. |

## list_story_files

Lists Egon story files (.egn, .egn.svg, .dst, .dst.svg) in the workspace directory, skipping node_modules and hidden folders.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `directory` | string | no | Subdirectory to search, relative to the workspace root. |

## get_story

Returns the story as actors, work objects, activities (with step numbers and names and ids of both ends), groups, annotations (with attachedTo and attachedToId for the element a note is attached to), the numbered sentences and a count of validation issues.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `includePositions` | boolean | no | Also return x/y of each shape. |

## narrate_story

Reads the story back as numbered sentences in Markdown, the way Egon's replay walks through it. Use it to check that the story says what the domain expert said.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |

## validate_story

Checks a story for problems: errors that break the import into Egon (dangling references, actor-to-actor activities, unknown icons) and warnings that hurt readability (unnamed elements, unlabeled activities, gaps in step numbers, unconnected or overlapping elements, group boxes that enclose shapes outside the group or overlap another group).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |

## set_story_info

Changes the title, description or scope of a story. Pass scope: null to clear it.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `title` | string | no | Story title. Egon 3 reads the title from the file name, so saved files are named after it. |
| `description` | string | no | Text Egon shows under the title. |
| `scope` | object {granularity?, pointInTime?, domainPurity?} or null | no | Scope of the story as shown in Egon's properties panel. |

## add_actor

Adds an actor: a person, group or system that does something. The default icon is Person; use Group or System for those, or search_icons for others.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `name` | string | yes | Name shown below the element, in the words of the domain. |
| `icon` | string | no | Name of a built-in Egon icon (see search_icons) or a custom icon added with add_custom_icon. |
| `color` | string | no | Color as hex, for example #1E88E5. |
| `x` | number | no | Left edge in Egon canvas pixels, at most a billion either way. Give x and y together, or omit both to place the element automatically. |
| `y` | number | no | Top edge in Egon canvas pixels, at most a billion either way. Give x and y together, or omit both to place the element automatically. |

## add_work_object

Adds a work object: something actors work with, such as a document, call, email or payment. The default icon is Document; search_icons finds others.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `name` | string | yes | Name shown below the element, in the words of the domain. |
| `icon` | string | no | Name of a built-in Egon icon (see search_icons) or a custom icon added with add_custom_icon. |
| `color` | string | no | Color as hex, for example #1E88E5. |
| `x` | number | no | Left edge in Egon canvas pixels, at most a billion either way. Give x and y together, or omit both to place the element automatically. |
| `y` | number | no | Top edge in Egon canvas pixels, at most a billion either way. Give x and y together, or omit both to place the element automatically. |

## add_activity

Draws an activity arrow between two elements. From an actor to a work object it gets the next step number. From a work object to an actor it names the recipient and has no number. Two actors cannot be connected directly.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `from` | string | yes | Id of an element, or the exact name of an actor, work object, group or annotation text. |
| `to` | string | yes | Id of an element, or the exact name of an actor, work object, group or annotation text. |
| `label` | string | yes | The verb or preposition shown on the arrow. |
| `number` | integer | no | Join an existing step to show parallel activities. |
| `color` | string | no | Color as hex, for example #1E88E5. |

## add_sentence

Adds one domain story sentence as a new step: actor, verb, work object and optional recipients ("Customer tells Order to Clerk"). Actors are matched by name (case-insensitive) or created; the work object is drawn new for this sentence unless reused (see workObject).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `actor` | string | yes | Name of the actor who acts. Created if missing. |
| `actorIcon` | string | no | Name of a built-in Egon icon (see search_icons) or a custom icon added with add_custom_icon. |
| `activity` | string | yes | The verb, for example "orders" or "writes". |
| `workObject` | string | yes | Name of the work object. Each sentence draws a new one, as in Egon, with the icon and color of the previous one of that name. Exceptions: an id of an existing work object, reuseWorkObject, or a work object of that name that is not used by any activity yet (declared up front or added with add_work_object), which this sentence then uses. |
| `workObjectIcon` | string | no | Name of a built-in Egon icon (see search_icons) or a custom icon added with add_custom_icon. |
| `reuseWorkObject` | boolean | no | Use the latest work object with this name instead of drawing a new one. |
| `to` | array of object {actor, activity?, actorIcon?} | no | Actors who receive the work object. |
| `number` | integer | no | Join an existing step (parallel activities) instead of adding a new one. |

## add_group

Draws a box around elements that belong together, such as a department or subdomain. Give members, or the step numbers of sentences as steps, and the box fits around them, holding them and the notes attached to them. An existing group whose actors and work objects are all chosen goes in whole; to put an existing group inside the new one in any case, name it in members. Named members move in from any group. The new group goes into the innermost group around the work objects of its steps, or without steps around its members, and that group grows to fit; run auto_layout when members came from different places. Other shapes the box happens to cover get a validate_story warning, and open_story would put those in no group into the smallest group box over their top-left corner when it opens the saved file. Or give x and y (with width and height) and no members to draw a box where you want it: as in Egon, it goes into the group its corner lies in and takes in every shape whose top-left corner lies inside. Without either, the box goes below the story. Shapes added or moved into a box later join its group.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `name` | string | yes | Label in the top-left corner of the box. |
| `members` | array of string | no | Elements to put in the group; a name means every element with that name. The box fits around them. |
| `steps` | array of integer | no | Step numbers as narrate_story shows them (parallel sentences share one): the work objects that first appear in those sentences go into the group and their actors stay outside, the usual way to mark a subdomain. A work object that later sentences use too belongs to the step that drew it; name it in members to move it here (next to steps, a name means the copies these steps use). The group goes into the innermost group around these work objects, and takes them from there; one that sits in any other group stays there, unless all of that group comes along, and the result lists it in leftInOtherGroups. Refused when nothing is left to group, and together with x, y, width or height. |
| `color` | string | no | Color as hex, for example #1E88E5. |
| `x` | number | no | Left edge of the box, at most a billion pixels either way. Give x and y together, and not with members or steps. |
| `y` | number | no | Top edge of the box, at most a billion pixels either way. Give x and y together. |
| `width` | number | no | Box width with x and y, at most a billion pixels; default 300. |
| `height` | number | no | Box height with x and y, at most a billion pixels; default 200. |

## add_annotation

Adds a note, optionally attached to an element with a dashed line. Use it for variations, business rules and open questions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `text` | string | yes | The note. |
| `attachTo` | string | no | Element the note belongs to; omit for a free-standing note. |
| `x` | number | no | Left edge in Egon canvas pixels, at most a billion either way. Give x and y together, or omit both to place the element automatically. |
| `y` | number | no | Top edge in Egon canvas pixels, at most a billion either way. Give x and y together, or omit both to place the element automatically. |

## update_element

Changes an element: rename it, change its icon or color, move or resize it, edit an annotation's text, or move an activity to another step number (the other steps shift). Pass color: "" to reset the color. As in Egon, a shape joins the group whose box it is moved into and leaves a group it is moved out of. Moving a group moves everything in it, and a moved or resized group takes in the shapes its box now covers.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `element` | string | yes | Id of an element, or the exact name of an actor, work object, group or annotation text. |
| `name` | string | no | New name or activity label. |
| `icon` | string | no | Name of a built-in Egon icon (see search_icons) or a custom icon added with add_custom_icon. |
| `color` | string | no | New color as hex, or "" to reset it. |
| `x` | number | no | New left edge (shapes only), at most a billion pixels either way. |
| `y` | number | no | New top edge (shapes only), at most a billion pixels either way. |
| `width` | number | no | New width (groups and annotations), at most a billion pixels. |
| `height` | number | no | New height (groups and annotations), at most a billion pixels. |
| `number` | integer | no | Activities from an actor: move to this step; later steps shift by one. |
| `text` | string | no | Text annotations: the new text. |

## remove_element

Removes an element. Removing an actor or work object also removes its activities; step numbers close up afterwards.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `element` | string | yes | Id of an element, or the exact name of an actor, work object, group or annotation text. |

## renumber_steps

Closes gaps in the step numbers (1, 2, 3 ...) while keeping their order and parallel steps.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |

## auto_layout

Arranges actors and work objects on a grid in reading order and reroutes every arrow. It keeps the members of each group together in a block of their own below the story, nested groups and annotations in a group included, puts an actor whose arrows all lead into groups beside the group it works in most (outside the box, its notes below it, narrowed to fit), refits the group boxes, moves other annotations next to their element and moves groups without members to the end. A note goes into the group of the element it is attached to, a note on a group into that group, and notes on nothing go after the story, so the story reopens with the same groups. Run it after adding many elements without positions, or when validate_story reports overlapping shapes or groups.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |

## add_custom_icon

Adds an icon that Egon does not ship, as an SVG. The story file carries the SVG, so Egon can draw it. The name must not clash with a built-in icon.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `kind` | `actor` \| `workObject` | yes | Whether the icon is offered for actors or work objects. |
| `name` | string | yes | Letters, digits, "-" and "_". |
| `svg` | string | yes | A complete <svg>...</svg> document, ideally with a 24x24 viewBox. |

## search_icons

Finds built-in Egon icons by name or keyword, for example "car", "invoice" or "phone". Use the returned name as icon in other tools.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Words to look for, for example "invoice" or "delivery truck". |
| `limit` | integer | no | Maximum number of results (default 10). |

## list_icons

Lists the names of all built-in Egon icons, plus the default icon set Egon starts with.

No parameters.

## export_story

Returns the story as text without writing a file: egn (Egon JSON), egn.svg (image with embedded story), svg (image only) or markdown (narrative). Use save_story to write a file instead.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `format` | `egn` \| `egn.svg` \| `svg` \| `markdown` | yes | egn: Egon file. egn.svg: image Egon can import. svg: image only. markdown: numbered sentences. |
| `title` | boolean | no | For svg: draw the title and description above the story (default true). |

## open_in_egon

Serves the story from a local link and returns an Egon app URL that loads it, so the user can see and edit it in the browser. The link always serves the latest state; reload Egon after further edits. Egon may ask the browser for permission to access the local network.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storyId` | string | yes | Id of an open story, as returned by create_story, build_story, open_story or list_stories. |
| `startReplay` | boolean | no | Start Egon's step-by-step replay right away. |
