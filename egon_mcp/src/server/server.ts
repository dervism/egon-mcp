import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { parseStoryFile, StoryParseError } from '../egon/parse.js';
import { fileNameFor, toEgnJson, type EgonFormat } from '../egon/serialize.js';
import { IconCatalog } from '../icons/catalog.js';
import { renderStorySvg } from '../render/svg.js';
import { autoLayout } from '../story/layout.js';
import { narrate, narrativeMarkdown } from '../story/narrate.js';
import { addSentence, buildStory, membersOfSteps, namedForSteps } from '../story/sentences.js';
import { Story, StoryError } from '../story/story.js';
import { validateStory } from '../story/validate.js';
import { describeStory, summarizeEntry } from './describe.js';
import { DOMAIN_STORYTELLING_GUIDE } from './guide.js';
import { egonAppUrl, LinkServer } from './link-server.js';
import { registerPrompts } from './prompts.js';
import { Workspace, WorkspaceError } from './workspace.js';

export const SERVER_NAME = 'egon-mcp';
export const SERVER_VERSION = '0.1.0';

export interface EgonServerOptions {
  /** Directory that file tools may read and write. */
  root: string;
  /** Egon app used by open_in_egon (default https://egon.io/app/). */
  egonAppUrl?: string;
  /** Layout of written .egn files (default egon3, which egon.io 3.x and Egon 4 import). */
  egonFormat?: EgonFormat;
}

export interface EgonServer {
  server: McpServer;
  workspace: Workspace;
  close(): Promise<void>;
}

const INSTRUCTIONS = `This server creates, edits, checks and renders domain stories for Egon.io (https://egon.io), the Domain Storytelling modeler.

Typical flow: build_story (or create_story plus add_sentence) -> validate_story -> narrate_story to read it back -> save_story to write an .egn file -> open_in_egon to show it in the Egon app.
Stories are referenced by storyId. Elements are referenced by id or by their exact name; each sentence draws its own work object, so use ids when a name appears more than once.
Two actors cannot be connected directly; put the work object they exchange between them.
Read egon://guide/domain-storytelling for the notation.`;

const scopeSchema = z
  .object({
    granularity: z
      .enum(['coarse-grained', 'medium-grained', 'fine-grained', 'cloud-level', 'kite-level', 'sea-level', 'fish-level', 'clam-level'])
      .optional(),
    pointInTime: z.enum(['as-is', 'to-be']).optional(),
    domainPurity: z.enum(['pure', 'digitalized']).optional(),
  })
  .describe('Scope of the story as shown in Egon\'s properties panel.');

const storyId = z.string().describe('Id of an open story, as returned by create_story, build_story, open_story or list_stories.');
const elementRef = z.string().describe('Id of an element, or the exact name of an actor, work object, group or annotation text.');
const color = z.string().describe('Color as hex, for example #1E88E5.');
const iconName = z.string().describe('Name of a built-in Egon icon (see search_icons) or a custom icon added with add_custom_icon.');
const x = z.number().describe('Left edge in Egon canvas pixels, at most a billion either way. Give x and y together, or omit both to place the element automatically.');
const y = z.number().describe('Top edge in Egon canvas pixels, at most a billion either way. Give x and y together, or omit both to place the element automatically.');

const recipientSchema = z.object({
  actor: z.string().describe('Name of the actor who receives the work object.'),
  activity: z.string().optional().describe('Label of the arrow to the recipient, for example "to" or "for".'),
  actorIcon: iconName.optional(),
});

const sentenceSchema = {
  actor: z.string().describe('Name of the actor who acts. Created if missing.'),
  actorIcon: iconName.optional(),
  activity: z.string().describe('The verb, for example "orders" or "writes".'),
  workObject: z
    .string()
    .describe('Name of the work object. Each sentence draws a new one, as in Egon, with the icon and color of the previous one of that name. Exceptions: an id of an existing work object, reuseWorkObject, or a work object of that name that is not used by any activity yet (declared up front or added with add_work_object), which this sentence then uses.'),
  workObjectIcon: iconName.optional(),
  reuseWorkObject: z.boolean().optional().describe('Use the latest work object with this name instead of drawing a new one.'),
  to: z.array(recipientSchema).optional().describe('Actors who receive the work object.'),
  number: z.number().int().positive().optional().describe('Join an existing step (parallel activities) instead of adding a new one.'),
};

const shapeSpec = z.object({ name: z.string(), icon: iconName.optional(), color: color.optional() });
const titleField = z.string().describe('Story title. Egon 3 reads the title from the file name, so saved files are named after it.');
const descriptionField = z.string().describe('Text Egon shows under the title.');
const nameField = z.string().describe('Name shown below the element, in the words of the domain.');
const steps = z
  .array(z.number().int().positive())
  .min(1)
  .describe(
    'Step numbers as narrate_story shows them (parallel sentences share one): the work objects of those sentences go into the group and their actors stay outside, the usual way to mark a subdomain. An existing group made only of the work objects of these steps, their notes and notes on the group goes in whole. If the work objects all sit in one group, the new group nests inside it and that group grows to fit. A work object that also serves a sentence outside these steps is refused unless you pass it in members too (by name, meaning the copy these steps use, or by id), which puts it here; one that already sits in a group other than the one the new group nests in, or one around that, stays where it is. Also refused: steps that are exactly an existing group, steps without a work object, work objects spread over different groups, where the new box would cross one, and steps together with x and y.',
  );
const groupSpec = z.object({
  name: z.string().describe('Label of the box; every group needs members or steps.'),
  members: z.array(z.string()).optional().describe('Names or ids of the actors and work objects inside the group.'),
  steps: steps.optional(),
  color: color.optional(),
});
const annotationSpec = z.object({
  text: z.string(),
  attachTo: z.string().optional().describe('Name of the element the note belongs to.'),
});

export function createEgonServer(options: EgonServerOptions): EgonServer {
  const workspace = new Workspace(options.root, options.egonFormat ? { egonFormat: options.egonFormat } : {});
  const egnFor = (id: string) => toEgnJson(workspace.get(id).story.toDocument(), { format: workspace.egonFormat });
  const links = new LinkServer();
  const catalog = IconCatalog.builtIn();
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  const storiesChanged = () => {
    if (server.isConnected()) {
      server.sendResourceListChanged();
    }
  };

  /** Runs a tool body and turns domain errors into MCP tool errors. */
  const run =
    <A>(body: (args: A) => Promise<CallToolResult> | CallToolResult) =>
    async (args: A): Promise<CallToolResult> => {
      try {
        return await body(args);
      } catch (error) {
        if (error instanceof StoryError || error instanceof StoryParseError || error instanceof WorkspaceError) {
          return { isError: true, content: [{ type: 'text', text: error.message }] };
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[egon-mcp] unexpected error: ${error instanceof Error ? error.stack : message}`);
        return { isError: true, content: [{ type: 'text', text: `Unexpected error: ${message}` }] };
      }
    };

  const json = (data: Record<string, unknown>): CallToolResult => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  });

  /**
   * Applies a change to a story and marks it unsaved. If the change throws,
   * the story goes back to how it was, so a failed tool call changes nothing.
   */
  const edit = <T>(id: string, change: (entry: ReturnType<Workspace['get']>) => T): T => {
    const entry = workspace.get(id);
    // A failed change leaves the story as it was, ids handed out included.
    const result = entry.story.transaction(() => change(entry));
    workspace.touch(id);
    return result;
  };

  // ---------------------------------------------------------------- lifecycle

  server.registerTool(
    'create_story',
    {
      title: 'Create domain story',
      description: 'Creates a new, empty domain story with Egon\'s default icon set and returns its storyId. Use build_story instead to create a whole story from sentences in one call.',
      inputSchema: { title: titleField, description: descriptionField.optional(), scope: scopeSchema.optional() },
    },
    run(({ title, description, scope }) => {
      const entry = workspace.create({ title, ...(description !== undefined ? { description } : {}), ...(scope ? { scope } : {}) });
      storiesChanged();
      return json({ storyId: entry.id, title });
    }),
  );

  server.registerTool(
    'build_story',
    {
      title: 'Build domain story from sentences',
      description:
        'Creates a complete domain story in one call from numbered sentences ("Customer tells Order to Clerk"), then lays it out. Each sentence becomes one step, except that sentences given the number of an earlier step share it. Actors with the same name are one element. Each sentence draws its own work object, except that the first sentence naming a declared work object uses it and reuseWorkObject continues the previous one. Returns the storyId, the narrative and any validation issues.',
      inputSchema: {
        title: titleField,
        description: descriptionField.optional(),
        scope: scopeSchema.optional(),
        actors: z.array(shapeSpec).optional().describe('Actors to create first, to choose their icon or color.'),
        workObjects: z.array(shapeSpec).optional().describe('Work objects to create first, to choose their icon or color. The first sentence that names one uses it, and a workObjectIcon on that sentence replaces its icon; later sentences draw new ones with the same icon and color.'),
        sentences: z.array(z.object(sentenceSchema)).min(1).describe('The steps of the story in order.'),
        groups: z.array(groupSpec).optional().describe('Boxes around elements that belong together, by members or by steps as add_group takes them. A group that names members next to its steps is added first, so the groups of other steps leave a shared work object it names where it is, whatever the order of the list.'),
        annotations: z.array(annotationSpec).optional().describe('Notes for variations, rules and open questions.'),
        layout: z.boolean().optional().describe('Arrange elements automatically (default true).'),
      },
    },
    run((input) => {
      const story = buildStory(input as Parameters<typeof buildStory>[0]);
      const entry = workspace.adopt(story);
      storiesChanged();
      const issues = validateStory(entry.story.toDocument());
      return json({
        storyId: entry.id,
        title: entry.story.title,
        narrative: narrativeMarkdown(entry.story.toDocument()),
        issues,
      });
    }),
  );

  server.registerTool(
    'open_story',
    {
      title: 'Open story file',
      description: 'Opens an Egon story file (.egn, .egn.svg, or legacy .dst / .dst.svg) from the workspace directory and returns its storyId.',
      inputSchema: { path: z.string().describe('Path relative to the workspace root, as listed by list_story_files.') },
    },
    run(({ path }) => {
      const entry = workspace.open(path);
      storiesChanged();
      return json({ storyId: entry.id, title: entry.story.title, path: entry.path ?? path, elements: entry.story.elements().length });
    }),
  );

  server.registerTool(
    'import_story',
    {
      title: 'Import story from text',
      description: 'Opens a story from the text of an .egn, .dst or .egn.svg file, for example one the user pasted. Use open_story for files in the workspace.',
      inputSchema: {
        content: z.string().describe('The full file content.'),
        fileName: z.string().optional().describe('Original file name; decides how the content is read and gives the title for old files.'),
      },
    },
    run(({ content, fileName }) => {
      const entry = workspace.importText(content, fileName ?? 'imported.egn');
      storiesChanged();
      return json({ storyId: entry.id, title: entry.story.title, elements: entry.story.elements().length });
    }),
  );

  server.registerTool(
    'list_stories',
    {
      title: 'List open stories',
      description: 'Lists the stories open in this session with their storyId, title, file path, size and whether they have unsaved changes.',
      annotations: { readOnlyHint: true },
    },
    run(() => json({ stories: workspace.list().map(summarizeEntry) })),
  );

  server.registerTool(
    'close_story',
    {
      title: 'Close story',
      description: 'Closes an open story without saving it. Save first with save_story if it has unsaved changes.',
      inputSchema: { storyId },
      annotations: { destructiveHint: true },
    },
    run(({ storyId: id }) => {
      const dirty = workspace.get(id).dirty;
      workspace.close(id);
      links.unpublish(id);
      storiesChanged();
      return json({ closed: id, discardedUnsavedChanges: dirty });
    }),
  );

  server.registerTool(
    'save_story',
    {
      title: 'Save story to file',
      description:
        'Writes a story into the workspace directory. For .egn and .egn.svg files it opens the written file the way open_story would: groupChangesOnOpen lists the group changes that would make, such as a shape in no group joining the smallest group box over its top-left corner, and reopenError says why the file would not open. Egon itself only reads who is in a group. The extension picks the format: .egn (Egon file), .egn.svg (image with the story embedded, importable by Egon), .svg (image only) or .md (narrative). Without a path the story goes back to the file it was opened from, or to "<title>.egn". An existing file is only replaced if this story opened or wrote it and nobody changed it since, or with overwrite: true.',
      inputSchema: {
        storyId,
        path: z.string().optional().describe('Target path relative to the workspace root.'),
        overwrite: z.boolean().optional().describe('Replace an existing file that this story did not open or write, or that changed since it did. Ask the user first.'),
        layout: z
          .enum(['egon3', 'egon4'])
          .optional()
          .describe('.egn layout: egon3 works in egon.io 3.x and Egon 4; egon4 also keeps title and scope. Default: when saving back to the file the story came from or was last saved to, the layout it last had there; else the layout of the Egon file being replaced; else the server setting.'),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    run(({ storyId: id, path, overwrite, layout }) => {
      const saved = workspace.save(id, { ...(path ? { path } : {}), ...(overwrite ? { overwrite } : {}), ...(layout ? { layout } : {}) });
      const check = saved.format === 'egn' || saved.format === 'egn.svg' ? reopenCheck(workspace, workspace.get(id).story, saved.path) : {};
      return json({ ...saved, ...check, workspaceRoot: workspace.root });
    }),
  );

  server.registerTool(
    'list_story_files',
    {
      title: 'List story files',
      description: 'Lists Egon story files (.egn, .egn.svg, .dst, .dst.svg) in the workspace directory, skipping node_modules and hidden folders.',
      inputSchema: { directory: z.string().optional().describe('Subdirectory to search, relative to the workspace root.') },
      annotations: { readOnlyHint: true },
    },
    run(({ directory }) => json({ workspaceRoot: workspace.root, files: workspace.listFiles(directory ?? '.') })),
  );

  // ------------------------------------------------------------------ reading

  server.registerTool(
    'get_story',
    {
      title: 'Get story contents',
      description:
        'Returns the story as actors, work objects, activities (with step numbers and names and ids of both ends), groups, annotations (with attachedTo and attachedToId for the element a note is attached to), the numbered sentences and a count of validation issues.',
      inputSchema: { storyId, includePositions: z.boolean().optional().describe('Also return x/y of each shape.') },
      annotations: { readOnlyHint: true },
    },
    run(({ storyId: id, includePositions }) => json(describeStory(workspace.get(id), { positions: includePositions ?? false }))),
  );

  server.registerTool(
    'narrate_story',
    {
      title: 'Narrate story',
      description: 'Reads the story back as numbered sentences in Markdown, the way Egon\'s replay walks through it. Use it to check that the story says what the domain expert said.',
      inputSchema: { storyId },
      annotations: { readOnlyHint: true },
    },
    run(({ storyId: id }) => {
      const doc = workspace.get(id).story.toDocument();
      const markdown = narrativeMarkdown(doc);
      return { content: [{ type: 'text', text: markdown }], structuredContent: { markdown, steps: narrate(doc) } };
    }),
  );

  server.registerTool(
    'validate_story',
    {
      title: 'Validate story',
      description:
        'Checks a story for problems: errors that break the import into Egon (dangling references, actor-to-actor activities, unknown icons) and warnings that hurt readability (unnamed elements, unlabeled activities, gaps in step numbers, unconnected or overlapping elements, group boxes that enclose shapes outside the group or overlap another group).',
      inputSchema: { storyId },
      annotations: { readOnlyHint: true },
    },
    run(({ storyId: id }) => {
      const issues = validateStory(workspace.get(id).story.toDocument());
      return json({
        errors: issues.filter((issue) => issue.severity === 'error').length,
        warnings: issues.filter((issue) => issue.severity === 'warning').length,
        issues,
      });
    }),
  );

  // ------------------------------------------------------------------ editing

  server.registerTool(
    'set_story_info',
    {
      title: 'Set title, description or scope',
      description: 'Changes the title, description or scope of a story. Pass scope: null to clear it.',
      inputSchema: { storyId, title: titleField.optional(), description: descriptionField.optional(), scope: scopeSchema.nullable().optional() },
    },
    run(({ storyId: id, title, description, scope }) =>
      json(
        edit(id, (entry) => {
          entry.story.setInfo({
            ...(title !== undefined ? { title } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(scope !== undefined ? { scope } : {}),
          });
          const doc = entry.story.toDocument();
          return { title: doc.title, description: doc.description, scope: doc.scope ?? null };
        }),
      ),
    ),
  );

  for (const kind of ['actor', 'work_object'] as const) {
    const isActorKind = kind === 'actor';
    server.registerTool(
      `add_${kind}`,
      {
        title: isActorKind ? 'Add actor' : 'Add work object',
        description: isActorKind
          ? 'Adds an actor: a person, group or system that does something. The default icon is Person; use Group or System for those, or search_icons for others.'
          : 'Adds a work object: something actors work with, such as a document, call, email or payment. The default icon is Document; search_icons finds others.',
        inputSchema: { storyId, name: nameField, icon: iconName.optional(), color: color.optional(), x: x.optional(), y: y.optional() },
      },
      run(({ storyId: id, name, icon, color: picked, x: left, y: top }) => {
        const input = {
          name,
          ...(icon ? { icon } : {}),
          ...(picked ? { color: picked } : {}),
          ...(left !== undefined ? { x: left } : {}),
          ...(top !== undefined ? { y: top } : {}),
        };
        const element = edit(id, (entry) => (isActorKind ? entry.story.addActor(input) : entry.story.addWorkObject(input)));
        return json({ ...element });
      }),
    );
  }

  server.registerTool(
    'add_activity',
    {
      title: 'Add activity',
      description:
        'Draws an activity arrow between two elements. From an actor to a work object it gets the next step number. From a work object to an actor it names the recipient and has no number. Two actors cannot be connected directly.',
      inputSchema: {
        storyId,
        from: elementRef,
        to: elementRef,
        label: z.string().describe('The verb or preposition shown on the arrow.'),
        number: z.number().int().positive().optional().describe('Join an existing step to show parallel activities.'),
        color: color.optional(),
      },
    },
    run(({ storyId: id, from, to, label, number, color: picked }) =>
      json({
        ...edit(id, (entry) =>
          entry.story.addActivity({ from, to, label, ...(number !== undefined ? { number } : {}), ...(picked ? { color: picked } : {}) }),
        ),
      }),
    ),
  );

  server.registerTool(
    'add_sentence',
    {
      title: 'Add sentence',
      description:
        'Adds one domain story sentence as a new step: actor, verb, work object and optional recipients ("Customer tells Order to Clerk"). Actors are matched by name (case-insensitive) or created; the work object is drawn new for this sentence unless reused (see workObject).',
      inputSchema: { storyId, ...sentenceSchema },
    },
    run(({ storyId: id, ...sentence }) => {
      const result = edit(id, (entry) => addSentence(entry.story, sentence as Parameters<typeof addSentence>[1]));
      return json({ number: result.number, created: result.created.map(({ id: elementId, name, type }) => ({ id: elementId, name, type })), activityIds: result.activityIds });
    }),
  );

  server.registerTool(
    'add_group',
    {
      title: 'Add group',
      description:
        'Draws a box around elements that belong together, such as a department or subdomain. To mark a subdomain on a coarse story, pass the step numbers of its sentences as steps: their work objects go in and their actors stay outside, since an actor often takes part in several subdomains. With members or steps and no x and y, the box fits around them and holds them and nothing else. Other shapes the box happens to cover get a validate_story warning, and open_story would put those in no group into the smallest group box over their top-left corner when it opens the saved file. With x, y, width and height, it takes in every shape whose top-left corner lies inside, as a box drawn in Egon does. Without members or position, the box goes below the story. Shapes added or moved into the box later join the group; a box drawn with x and y inside another group goes into that group, and a box fitted around members goes into the innermost group that already holds all of them, which grows to fit it. An existing group goes in whole when everything it holds is among the members, a note counting with the element it is attached to or with the group itself; otherwise its chosen members move one by one, each with its notes. Without x and y, members that are exactly one existing group you did not name are refused.',
      inputSchema: {
        storyId,
        name: z.string().describe('Label in the top-left corner of the box.'),
        members: z.array(elementRef).optional().describe('Elements to put in the group, even outside the box. Without x and y the box fits around them.'),
        steps: steps.optional(),
        color: color.optional(),
        x: z.number().optional().describe('Left edge of the box, at most a billion pixels either way. Give x and y together; without them the box fits around the members, or goes below the story when there are none.'),
        y: z.number().optional().describe('Top edge of the box, at most a billion pixels either way. Give x and y together.'),
        width: z.number().positive().optional().describe('Box width with x and y, at most a billion pixels; default 300.'),
        height: z.number().positive().optional().describe('Box height with x and y, at most a billion pixels; default 200.'),
      },
    },
    run(({ storyId: id, name, members, steps: numbers, color: picked, x: left, y: top, width, height }) => {
      if (numbers && (left !== undefined || top !== undefined)) {
        throw new StoryError('The steps fit the box around their work objects, and a box drawn with x and y would take in their actors too. Leave out x, y, width and height, or pass members instead of steps.');
      }
      return json({
        ...edit(id, (entry) =>
          entry.story.addGroup({
            name,
            ...(members || numbers
              ? {
                  members: numbers
                    ? ((named: string[]) => [...named, ...membersOfSteps(entry.story, numbers, named)])(namedForSteps(entry.story, members ?? [], numbers))
                    : (members ?? []),
                }
              : {}),
            ...(picked ? { color: picked } : {}),
            ...(left !== undefined ? { x: left } : {}),
            ...(top !== undefined ? { y: top } : {}),
            ...(width !== undefined ? { width } : {}),
            ...(height !== undefined ? { height } : {}),
          }),
        ),
      });
    }),
  );

  server.registerTool(
    'add_annotation',
    {
      title: 'Add text annotation',
      description: 'Adds a note, optionally attached to an element with a dashed line. Use it for variations, business rules and open questions.',
      inputSchema: {
        storyId,
        text: z.string().describe('The note.'),
        attachTo: elementRef.optional().describe('Element the note belongs to; omit for a free-standing note.'),
        x: x.optional(),
        y: y.optional(),
      },
    },
    run(({ storyId: id, text, attachTo, x: left, y: top }) => {
      const result = edit(id, (entry) =>
        entry.story.addAnnotation({
          text,
          ...(attachTo ? { attachTo } : {}),
          ...(left !== undefined ? { x: left } : {}),
          ...(top !== undefined ? { y: top } : {}),
        }),
      );
      return json({ annotation: result.annotation, ...(result.connection ? { connection: result.connection } : {}) });
    }),
  );

  server.registerTool(
    'update_element',
    {
      title: 'Update element',
      description:
        'Changes an element: rename it, change its icon or color, move or resize it, edit an annotation\'s text, or move an activity to another step number (the other steps shift). Pass color: "" to reset the color. As in Egon, a shape joins the group whose box it is moved into and leaves a group it is moved out of. Moving a group moves everything in it, and a moved or resized group takes in the shapes its box now covers.',
      inputSchema: {
        storyId,
        element: elementRef,
        name: z.string().optional().describe('New name or activity label.'),
        icon: iconName.optional(),
        color: z.string().optional().describe('New color as hex, or "" to reset it.'),
        x: z.number().optional().describe('New left edge (shapes only), at most a billion pixels either way.'),
        y: z.number().optional().describe('New top edge (shapes only), at most a billion pixels either way.'),
        width: z.number().positive().optional().describe('New width (groups and annotations), at most a billion pixels.'),
        height: z.number().positive().optional().describe('New height (groups and annotations), at most a billion pixels.'),
        number: z.number().int().positive().optional().describe('Activities from an actor: move to this step; later steps shift by one.'),
        text: z.string().optional().describe('Text annotations: the new text.'),
      },
    },
    run(({ storyId: id, element, ...update }) => {
      const cleaned = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
      return json({ ...edit(id, (entry) => entry.story.updateElement(element, cleaned)) });
    }),
  );

  server.registerTool(
    'remove_element',
    {
      title: 'Remove element',
      description: 'Removes an element. Removing an actor or work object also removes its activities; step numbers close up afterwards.',
      inputSchema: { storyId, element: elementRef },
      annotations: { destructiveHint: true },
    },
    run(({ storyId: id, element }) => {
      const removed = edit(id, (entry) => entry.story.removeElement(element));
      return json({ removed: removed.map(({ id: elementId, name, type }) => ({ id: elementId, name, type })) });
    }),
  );

  server.registerTool(
    'renumber_steps',
    {
      title: 'Renumber steps',
      description: 'Closes gaps in the step numbers (1, 2, 3 ...) while keeping their order and parallel steps.',
      inputSchema: { storyId },
      annotations: { idempotentHint: true },
    },
    run(({ storyId: id }) => {
      edit(id, (entry) => entry.story.compactNumbers());
      return json({ steps: narrate(workspace.get(id).story.toDocument()).map((step) => `${step.number}. ${step.sentence}`) });
    }),
  );

  server.registerTool(
    'auto_layout',
    {
      title: 'Auto layout',
      description: 'Arranges actors and work objects on a grid in reading order and reroutes every arrow. It keeps the members of each group together in a block of their own below the story, nested groups and annotations in a group included, puts an actor whose arrows all lead into groups beside the group it works in most (outside the box, its notes below it, narrowed to fit), refits the group boxes, moves other annotations next to their element and moves groups without members to the end. A note goes into the group of the element it is attached to, a note on a group into that group, and notes on nothing go after the story, so the story reopens with the same groups. Run it after adding many elements without positions, or when validate_story reports overlapping shapes or groups.',
      inputSchema: { storyId },
      annotations: { idempotentHint: true },
    },
    run(({ storyId: id }) => {
      edit(id, (entry) => autoLayout(entry.story));
      const layoutCodes = new Set(['overlapping-shapes', 'group-encloses-non-member', 'overlapping-groups']);
      const overlaps = validateStory(workspace.get(id).story.toDocument()).filter((issue) => layoutCodes.has(issue.code));
      return json({ laidOut: true, remainingOverlaps: overlaps.length });
    }),
  );

  server.registerTool(
    'add_custom_icon',
    {
      title: 'Add custom icon',
      description: 'Adds an icon that Egon does not ship, as an SVG. The story file carries the SVG, so Egon can draw it. The name must not clash with a built-in icon.',
      inputSchema: {
        storyId,
        kind: z.enum(['actor', 'workObject']).describe('Whether the icon is offered for actors or work objects.'),
        name: z.string().describe('Letters, digits, "-" and "_".'),
        svg: z.string().describe('A complete <svg>...</svg> document, ideally with a 24x24 viewBox.'),
      },
    },
    run(({ storyId: id, kind, name, svg }) => {
      edit(id, (entry) => entry.story.addCustomIcon({ kind, name, svg }));
      return json({ added: name, kind });
    }),
  );

  // -------------------------------------------------------------------- icons

  server.registerTool(
    'search_icons',
    {
      title: 'Search icons',
      description: 'Finds built-in Egon icons by name or keyword, for example "car", "invoice" or "phone". Use the returned name as icon in other tools.',
      inputSchema: {
        query: z.string().describe('Words to look for, for example "invoice" or "delivery truck".'),
        limit: z.number().int().positive().max(50).optional().describe('Maximum number of results (default 10).'),
      },
      annotations: { readOnlyHint: true },
    },
    run(({ query, limit }) =>
      json({ icons: catalog.search(query, limit ?? 10).map((icon) => ({ name: icon.name, keywords: icon.keywords })) }),
    ),
  );

  server.registerTool(
    'list_icons',
    {
      title: 'List icons',
      description: 'Lists the names of all built-in Egon icons, plus the default icon set Egon starts with.',
      annotations: { readOnlyHint: true },
    },
    run(() => {
      const defaults = catalog.defaultIconSet();
      return json({
        icons: catalog.names(),
        defaultActors: Object.keys(defaults.actors),
        defaultWorkObjects: Object.keys(defaults.workObjects),
      });
    }),
  );

  // ------------------------------------------------------------------- output

  server.registerTool(
    'export_story',
    {
      title: 'Export story',
      description:
        'Returns the story as text without writing a file: egn (Egon JSON), egn.svg (image with embedded story), svg (image only) or markdown (narrative). Use save_story to write a file instead.',
      inputSchema: {
        storyId,
        format: z.enum(['egn', 'egn.svg', 'svg', 'markdown']).describe('egn: Egon file. egn.svg: image Egon can import. svg: image only. markdown: numbered sentences.'),
        title: z.boolean().optional().describe('For svg: draw the title and description above the story (default true).'),
      },
      annotations: { readOnlyHint: true },
    },
    run(({ storyId: id, format, title }) => {
      const story = workspace.get(id).story;
      let output: string;
      if (format === 'svg' && title === false) {
        output = renderStorySvg(story.toDocument(), { whiteBackground: true });
      } else {
        output = workspace.serialize(story, format);
      }
      return { content: [{ type: 'text', text: output }] };
    }),
  );

  server.registerTool(
    'open_in_egon',
    {
      title: 'Open in Egon',
      description:
        'Serves the story from a local link and returns an Egon app URL that loads it, so the user can see and edit it in the browser. The link always serves the latest state; reload Egon after further edits. Egon may ask the browser for permission to access the local network.',
      inputSchema: { storyId, startReplay: z.boolean().optional().describe('Start Egon\'s step-by-step replay right away.') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    run(async ({ storyId: id, startReplay }) => {
      const entry = workspace.get(id);
      const storyUrl = await links.publish(id, fileNameFor(entry.story.title, 'egn'), () => egnFor(id));
      const url = egonAppUrl(storyUrl, {
        startReplay: startReplay ?? false,
        ...(options.egonAppUrl ? { appUrl: options.egonAppUrl } : {}),
      });
      return json({
        egonUrl: url,
        storyUrl,
        note: 'Open egonUrl in a browser on this machine. The link works while this server runs. Use save_story to keep a file.',
      });
    }),
  );

  // ---------------------------------------------------------------- resources

  server.registerResource(
    'icons',
    'egon://icons',
    { title: 'Built-in Egon icons', description: 'Names and search keywords of every built-in icon.', mimeType: 'application/json' },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(catalog.all().map((icon) => ({ name: icon.name, keywords: icon.keywords }))),
        },
      ],
    }),
  );

  server.registerResource(
    'domain-storytelling-guide',
    'egon://guide/domain-storytelling',
    { title: 'Domain Storytelling notation guide', description: 'Building blocks, sentence structure and good practice.', mimeType: 'text/markdown' },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: DOMAIN_STORYTELLING_GUIDE }] }),
  );

  const storyResource = (
    name: string,
    suffix: string,
    mimeType: string,
    title: string,
    render: (id: string) => string,
  ) =>
    server.registerResource(
      name,
      new ResourceTemplate(`egon://stories/{storyId}/${suffix}`, {
        list: () => ({
          resources: workspace.list().map((entry) => ({
            uri: `egon://stories/${entry.id}/${suffix}`,
            name: `${entry.story.title} (${suffix})`,
            mimeType,
          })),
        }),
      }),
      { title, mimeType },
      (uri, variables) => {
        const id = String(variables['storyId']);
        return { contents: [{ uri: uri.href, mimeType, text: render(id) }] };
      },
    );

  storyResource('story-egn', 'egn', 'application/json', 'Story as Egon .egn JSON', egnFor);
  storyResource('story-narrative', 'narrative', 'text/markdown', 'Story as numbered sentences', (id) =>
    narrativeMarkdown(workspace.get(id).story.toDocument()),
  );
  storyResource('story-svg', 'svg', 'image/svg+xml', 'Story as SVG image', (id) =>
    renderStorySvg(workspace.get(id).story.toDocument(), { title: true, whiteBackground: true }),
  );

  registerPrompts(server);

  return {
    server,
    workspace,
    async close() {
      await links.stop();
      await server.close();
    },
  };
}

/**
 * Opens the file just written the way open_story would and reports what
 * would differ: group changes (a file only records who is in a group, so a
 * shape that lies in a group's box without a group of its own joins it;
 * Egon itself only reads `parent`), or that the file would not open at all.
 */
function reopenCheck(workspace: Workspace, story: Story, path: string): { groupChangesOnOpen?: string[]; reopenError?: string } {
  let reopened: Story;
  try {
    reopened = Story.fromDocument(workspace.readStory(path));
  } catch (error) {
    return { reopenError: `open_story would refuse the saved file: ${(error as Error).message}` };
  }
  const before = story.elements();
  const after = new Map(reopened.elements().map((element) => [element.id, element['parent']]));
  const byId = new Map(before.map((element) => [element.id, element]));
  const nameOf = (id: unknown) => {
    const element = typeof id === 'string' ? byId.get(id) : undefined;
    return element ? element.name || (element['text'] as string | undefined) || element.id : String(id);
  };
  const changes = before
    .filter((element) => element['parent'] !== after.get(element.id))
    .map((element) => {
      const now = after.get(element.id);
      return now === undefined
        ? `"${nameOf(element.id)}" is in no group after open_story opens the file.`
        : `"${nameOf(element.id)}" goes into "${nameOf(now)}" when open_story opens the file, because its top-left corner lies in that box.`;
    });
  return changes.length > 0 ? { groupChangesOnOpen: changes } : {};
}
