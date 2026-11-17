import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeAll } from '../../test/close-all.js';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import { Story } from '../story/story.js';
import { createEgonServer, type EgonServer } from './server.js';

let root: string;
let egon: EgonServer;
let client: Client;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'egon-mcp-'));
  egon = createEgonServer({ root });
  client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([egon.server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  try {
    await closeAll(client, egon);
  } finally {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

type ToolResult = { isError?: boolean; content: { type: string; text?: string }[]; structuredContent?: Record<string, unknown> };

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

async function ok(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await call(name, args);
  if (result.isError) {
    throw new Error(`${name} failed: ${result.content[0]?.text}`);
  }
  return result.structuredContent ?? {};
}

function text(result: ToolResult): string {
  return result.content.map((part) => part.text ?? '').join('\n');
}

const pizza = {
  title: 'Order pizza',
  description: 'Happy path',
  sentences: [
    { actor: 'Customer', activity: 'tells', workObject: 'Order', to: [{ activity: 'to', actor: 'Clerk' }] },
    { actor: 'Clerk', activity: 'writes', workObject: 'Order slip', to: [{ activity: 'for', actor: 'Pizza baker' }] },
    { actor: 'Pizza baker', activity: 'bakes', workObject: 'Pizza', workObjectIcon: 'Dining' },
  ],
};

describe('egon-mcp server', () => {
  it('offers tools for the whole story lifecycle', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const name of [
      'create_story',
      'build_story',
      'open_story',
      'import_story',
      'list_stories',
      'close_story',
      'save_story',
      'list_story_files',
      'get_story',
      'narrate_story',
      'validate_story',
      'set_story_info',
      'add_actor',
      'add_work_object',
      'add_activity',
      'add_sentence',
      'add_group',
      'add_annotation',
      'update_element',
      'remove_element',
      'renumber_steps',
      'auto_layout',
      'add_custom_icon',
      'search_icons',
      'list_icons',
      'export_story',
      'open_in_egon',
    ]) {
      expect(names).toContain(name);
    }
    for (const tool of tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(30);
    }
  });

  it('builds a story from sentences, validates it and saves it as an .egn file', async () => {
    const built = await ok('build_story', pizza);
    expect(built['storyId']).toBe('order-pizza');
    expect(built['narrative']).toContain('1. Customer tells Order to Clerk.');

    const issues = await ok('validate_story', { storyId: 'order-pizza' });
    expect(issues['errors']).toBe(0);

    const saved = await ok('save_story', { storyId: 'order-pizza' });
    expect(saved['path']).toBe('Order pizza.egn');
    const doc = parseStoryFile(readFileSync(join(root, 'Order pizza.egn'), 'utf8'), 'Order pizza.egn');
    expect(doc.elements.filter((e) => e.type === 'domainStory:activity')).toHaveLength(5);
  });

  it('edits a story element by element', async () => {
    await ok('create_story', { title: 'Visit', description: 'A visit', scope: { pointInTime: 'to-be' } });
    const customer = await ok('add_actor', { storyId: 'visit', name: 'Customer' });
    await ok('add_work_object', { storyId: 'visit', name: 'Ticket', icon: 'Receipt' });
    await ok('add_actor', { storyId: 'visit', name: 'Desk', icon: 'System' });
    const activity = await ok('add_activity', { storyId: 'visit', from: 'Customer', to: 'Ticket', label: 'draws' });
    expect(activity['number']).toBe(1);
    await ok('add_activity', { storyId: 'visit', from: 'Ticket', to: 'Desk', label: 'at' });

    const story = await ok('get_story', { storyId: 'visit' });
    expect(story['actors']).toEqual([
      expect.objectContaining({ id: customer['id'], name: 'Customer', icon: 'Person' }),
      expect.objectContaining({ name: 'Desk', icon: 'System' }),
    ]);
    expect(story['activities']).toContainEqual(
      expect.objectContaining({ number: 1, label: 'draws', from: 'Customer', to: 'Ticket' }),
    );
    expect(story['scope']).toEqual({ pointInTime: 'to-be' });

    await ok('update_element', { storyId: 'visit', element: 'Customer', name: 'Guest', color: '#43A047' });
    const narrative = await call('narrate_story', { storyId: 'visit' });
    expect(text(narrative)).toContain('1. Guest draws Ticket at Desk.');

    const removed = await ok('remove_element', { storyId: 'visit', element: 'Desk' });
    expect(removed['removed']).toHaveLength(2);
  });

  it('adds sentences, groups, annotations and custom icons', async () => {
    await ok('create_story', { title: 'Shop' });
    const sentence = await ok('add_sentence', {
      storyId: 'shop',
      actor: 'Customer',
      activity: 'pays with',
      workObject: 'Card',
      workObjectIcon: 'Credit-Card',
      to: [{ activity: 'at', actor: 'Cashier' }],
    });
    expect(sentence['number']).toBe(1);
    await ok('add_group', { storyId: 'shop', name: 'Checkout', members: ['Cashier'] });
    await ok('add_annotation', { storyId: 'shop', text: 'Contactless only', attachTo: 'Card' });
    await ok('add_custom_icon', {
      storyId: 'shop',
      kind: 'workObject',
      name: 'Coupon',
      svg: '<svg viewBox="0 0 24 24"><rect width="20" height="10"/></svg>',
    });
    await ok('add_work_object', { storyId: 'shop', name: 'Discount', icon: 'Coupon' });
    await ok('auto_layout', { storyId: 'shop' });
    const story = await ok('get_story', { storyId: 'shop' });
    expect(story['groups']).toEqual([expect.objectContaining({ name: 'Checkout', members: ['Cashier'] })]);
    expect(story['annotations']).toEqual([expect.objectContaining({ text: 'Contactless only', attachedTo: 'Card' })]);
  });

  it('returns tool errors with a helpful message instead of failing', async () => {
    await ok('create_story', { title: 'T' });
    const result = await call('add_activity', { storyId: 't', from: 'Nobody', to: 'Nothing', label: 'x' });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/no element/i);
    const missing = await call('get_story', { storyId: 'nope' });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toMatch(/No open story/);
  });

  it('leaves a story unchanged when an edit fails halfway', async () => {
    await ok('create_story', { title: 'Atomic' });
    const failed = await call('add_sentence', { storyId: 'atomic', actor: 'Customer', activity: 'eats', workObject: 'Pizza', number: 5 });
    expect(failed.isError).toBe(true);
    const story = await ok('get_story', { storyId: 'atomic' });
    expect(story['actors']).toEqual([]);
    expect(story['workObjects']).toEqual([]);

    await ok('add_actor', { storyId: 'atomic', name: 'Ann' });
    const rename = await call('update_element', { storyId: 'atomic', element: 'Ann', name: 'Bob', icon: 'NoSuchIcon' });
    expect(rename.isError).toBe(true);
    expect(((await ok('get_story', { storyId: 'atomic' }))['actors'] as { name: string }[])[0]?.name).toBe('Ann');
  });

  it('marks save_story as destructive because it can overwrite files', async () => {
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === 'save_story')?.annotations?.destructiveHint).toBe(true);
  });

  it('renumbers steps and moves an activity to another step', async () => {
    await ok('build_story', pizza);
    const story = await ok('get_story', { storyId: 'order-pizza' });
    const bake = (story['activities'] as { id: string; label: string }[]).find((a) => a.label === 'bakes')!;
    await ok('update_element', { storyId: 'order-pizza', element: bake.id, number: 1 });
    const narrative = text(await call('narrate_story', { storyId: 'order-pizza' }));
    expect(narrative).toContain('1. Pizza baker bakes Pizza.');
    const removed = await ok('remove_element', { storyId: 'order-pizza', element: bake.id });
    expect(removed['removed']).toHaveLength(1);
    const renumbered = await ok('renumber_steps', { storyId: 'order-pizza' });
    expect(renumbered['steps']).toEqual(['1. Customer tells Order to Clerk.', '2. Clerk writes Order slip for Pizza baker.']);
  });

  it('finds icons', async () => {
    const result = await ok('search_icons', { query: 'car' });
    expect((result['icons'] as { name: string }[])[0]?.name).toBe('Car');
    const all = await ok('list_icons');
    expect((all['icons'] as string[]).length).toBeGreaterThan(100);
  });

  it('exports SVG and Markdown inline', async () => {
    await ok('build_story', pizza);
    const svg = await call('export_story', { storyId: 'order-pizza', format: 'svg' });
    expect(text(svg)).toMatch(/^<svg/);
    const egn = await call('export_story', { storyId: 'order-pizza', format: 'egn' });
    expect(parseStoryFile(text(egn), 'Order pizza.egn').elements.length).toBeGreaterThan(5);
    const markdown = await call('export_story', { storyId: 'order-pizza', format: 'markdown' });
    expect(text(markdown)).toContain('# Order pizza');
  });

  it('opens, imports and lists story files in the workspace', async () => {
    writeFileSync(join(root, 'sample.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const files = await ok('list_story_files');
    expect(files['files']).toEqual(['sample.egn']);
    const opened = await ok('open_story', { path: 'sample.egn' });
    expect(opened['title']).toBe('testTitle');
    const imported = await ok('import_story', { content: readEgonFixture('dst_export_version_2_2_0.json'), fileName: 'old.dst' });
    expect(imported['title']).toBe('old');
    const list = await ok('list_stories');
    expect((list['stories'] as unknown[]).length).toBe(2);
    await ok('close_story', { storyId: opened['storyId'] });
    expect(((await ok('list_stories'))['stories'] as unknown[]).length).toBe(1);
  });

  it('saves in the layout that save_story asks for', async () => {
    await ok('build_story', pizza);
    const saved = await ok('save_story', { storyId: 'order-pizza', layout: 'egon4' });
    expect(saved['layout']).toBe('egon4');
    const file = JSON.parse(readFileSync(join(root, 'Order pizza.egn'), 'utf8'));
    expect(file.domainStory.title).toBe('Order pizza');
  });

  it('tells agents what auto_layout does with groups and what validate_story checks', async () => {
    const { tools } = await client.listTools();
    const describe = (name: string) => tools.find((tool) => tool.name === name)?.description ?? '';
    expect(describe('auto_layout')).toMatch(/keeps the members of each group together/);
    expect(describe('auto_layout')).toMatch(/beside the group it works in most/);
    expect(describe('validate_story')).toMatch(/group boxes that enclose shapes outside the group/);
    expect(describe('auto_layout')).toMatch(/A note goes into the group of the element it is attached to/);
  });

  it('warns on save about shapes that will join a group when the file is opened again', async () => {
    await ok('create_story', { title: 'Covered' });
    await ok('add_actor', { storyId: 'covered', name: 'A', x: 100, y: 100 });
    await ok('add_work_object', { storyId: 'covered', name: 'W', x: 150, y: 150 });
    await ok('add_group', { storyId: 'covered', name: 'G', members: ['A'] });
    const saved = await ok('save_story', { storyId: 'covered' });
    expect(saved['groupChangesOnOpen']).toEqual([expect.stringContaining('"W"')]);
  });

  it('reports on save only the groups that open_story would really change', async () => {
    await ok('create_story', { title: 'Exact' });
    await ok('add_actor', { storyId: 'exact', name: 'A', x: 100, y: 100 });
    await ok('add_work_object', { storyId: 'exact', name: 'W', x: 100, y: 500 });
    await ok('add_group', { storyId: 'exact', name: 'G1', members: ['A'] });
    // A already belongs to G1, so the box of G2 around it changes nothing on open.
    await ok('add_group', { storyId: 'exact', name: 'G2', x: 80, y: 80, width: 400, height: 300 });
    expect((await ok('save_story', { storyId: 'exact' }))['groupChangesOnOpen']).toBeUndefined();
    // An empty group whose corner touches a fitted box goes into it on open.
    await ok('add_group', { storyId: 'exact', name: 'Tag', x: 900, y: 900, width: 50, height: 50 });
    await ok('add_work_object', { storyId: 'exact', name: 'V', x: 1000, y: 1000 });
    await ok('add_actor', { storyId: 'exact', name: 'B', x: 760, y: 760 });
    await ok('add_group', { storyId: 'exact', name: 'Big', members: ['B', 'V'] });
    const saved = await ok('save_story', { storyId: 'exact', path: 'exact.egn' });
    expect(saved['groupChangesOnOpen']).toEqual([expect.stringContaining('"Tag"')]);
    expect((await ok('save_story', { storyId: 'exact', path: 'exact.md' }))['groupChangesOnOpen']).toBeUndefined();
    expect((await ok('save_story', { storyId: 'exact', path: 'exact.egn.svg' }))['groupChangesOnOpen']).toEqual([expect.stringContaining('"Tag"')]);
    expect((await ok('save_story', { storyId: 'exact', path: 'exact.svg' }))['groupChangesOnOpen']).toBeUndefined();
  });

  it('does not use up ids on a refused add_sentence', async () => {
    await ok('create_story', { title: 'Refused' });
    expect((await call('add_sentence', { storyId: 'refused', actor: 'Alice', activity: 'writes', workObject: 'Note', number: 5 })).isError).toBe(true);
    expect((await ok('add_actor', { storyId: 'refused', name: 'Bob' }))['id']).toBe('shape_10000');
  });

  it('says on save when open_story would refuse the written file', async () => {
    const doc = Story.create({ title: 'Far away' }).toDocument();
    doc.elements.push({ type: 'domainStory:actorPerson', id: 'shape_1', name: 'Far', x: 5e9, y: 0 });
    const entry = egon.workspace.adopt(Story.fromDocument(doc));
    const saved = await ok('save_story', { storyId: entry.id, path: 'far.egn' });
    expect(saved['reopenError']).toMatch(/within a billion pixels/);
  });

  it('says on save when the written file is larger than open_story reads', async () => {
    await ok('create_story', { title: 'Huge', description: 'x'.repeat(21 * 1024 * 1024) });
    const saved = await ok('save_story', { storyId: 'huge', path: 'huge.egn' });
    expect(saved['reopenError']).toMatch(/larger than 20 MB/);
  });

  it('groups the work objects of numbered sentences with add_group', async () => {
    await ok('build_story', pizza);
    const group = await ok('add_group', { storyId: 'order-pizza', name: 'Ordering', steps: [1] });
    const story = await ok('get_story', { storyId: 'order-pizza' });
    const ordering = (story['groups'] as { id: string; members: string[] }[]).find((candidate) => candidate.id === group['id']);
    expect(ordering?.members).toEqual(['Order']);
  });

  it('settles a shared work object through members next to steps in add_group', async () => {
    await ok('build_story', {
      title: 'Shared',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'notes', workObject: 'Part request', to: [{ activity: 'for', actor: 'Clerk' }] },
        { actor: 'Clerk', activity: 'reads', workObject: 'Part request', reuseWorkObject: true },
      ],
    });
    expect((await call('add_group', { storyId: 'shared', name: 'Intake', steps: [1, 2] })).isError).toBe(true);
    await ok('add_group', { storyId: 'shared', name: 'Intake', steps: [1, 2], members: ['Part request'] });
    const story = await ok('get_story', { storyId: 'shared' });
    const intake = (story['groups'] as { name: string; members: string[] }[]).find((group) => group.name === 'Intake');
    expect(intake?.members.sort()).toEqual(['Bike', 'Part request']);
  });

  it('reports a refused grouping by steps as an error', async () => {
    await ok('build_story', pizza);
    const refused = await call('add_group', { storyId: 'order-pizza', name: 'Nowhere', steps: [9] });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toMatch(/no step 9/);
  });

  it('tells agents how shapes get into a group', async () => {
    const { tools } = await client.listTools();
    const describe = (name: string) => tools.find((tool) => tool.name === name)?.description ?? '';
    expect(describe('add_group')).toMatch(/fits around them and holds them and nothing else/);
    expect(describe('add_group')).toMatch(/open_story would put those in no group into the smallest group box/);
    expect(describe('save_story')).toMatch(/groupChangesOnOpen/);
    expect(describe('add_group')).toMatch(/takes in every shape whose top-left corner lies inside/);
    expect(describe('update_element')).toMatch(/joins the group whose box it is moved into/);
    expect(describe('update_element')).toMatch(/Moving a group moves everything in it/);
  });

  it('tells agents how sentences pick their work object', async () => {
    const { tools } = await client.listTools();
    const fieldDescription = (tool: string, field: string) =>
      (tools.find((t) => t.name === tool)?.inputSchema.properties?.[field] as { description?: string } | undefined)?.description ?? '';
    expect(fieldDescription('add_sentence', 'workObject')).toMatch(/not used by any activity yet/);
    expect(fieldDescription('build_story', 'workObjects')).toMatch(/first sentence that names/);
    expect(fieldDescription('build_story', 'workObjects')).toMatch(/workObjectIcon on that sentence replaces/);
    expect(fieldDescription('save_story', 'overwrite')).toMatch(/did not open or write, or that changed since it did/);
  });

  it('saves to other formats and refuses paths outside the workspace', async () => {
    await ok('build_story', pizza);
    await ok('save_story', { storyId: 'order-pizza', path: 'out/pizza.egn.svg' });
    expect(existsSync(join(root, 'out/pizza.egn.svg'))).toBe(true);
    const outside = await call('save_story', { storyId: 'order-pizza', path: '../escape.egn' });
    expect(outside.isError).toBe(true);
  });

  it('opens a story in Egon through a local link', async () => {
    await ok('build_story', pizza);
    const result = await ok('open_in_egon', { storyId: 'order-pizza', startReplay: true });
    expect(result['egonUrl']).toMatch(/^https:\/\/egon\.io\/app\/\?storyUrl=http%3A%2F%2F127\.0\.0\.1/);
    expect(result['egonUrl']).toMatch(/startReplay=true$/);
    const served = await fetch(result['storyUrl'] as string);
    expect(result['storyUrl']).toMatch(/\/Order%20pizza\.egn$/);
    expect(parseStoryFile(await served.text(), 'Order pizza.egn').title).toBe('Order pizza');
  });

  it('writes the Egon 4 layout when the server is configured for it', async () => {
    const egon4 = createEgonServer({ root, egonFormat: 'egon4' });
    const other = new Client({ name: 'egon4-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([egon4.server.connect(serverTransport), other.connect(clientTransport)]);
    try {
      await other.callTool({ name: 'build_story', arguments: pizza });
      const egn = (await other.callTool({ name: 'export_story', arguments: { storyId: 'order-pizza', format: 'egn' } })) as ToolResult;
      expect(JSON.parse(text(egn))).toHaveProperty('domainStory.title', 'Order pizza');
    } finally {
      await other.close();
      await egon4.close();
    }
  });

  it('exposes resources for stories, icons and the notation guide', async () => {
    await ok('build_story', pizza);
    const { resources } = await client.listResources();
    const uris = resources.map((resource) => resource.uri);
    expect(uris).toContain('egon://icons');
    expect(uris).toContain('egon://guide/domain-storytelling');
    expect(uris).toContain('egon://stories/order-pizza/narrative');
    const narrative = await client.readResource({ uri: 'egon://stories/order-pizza/narrative' });
    expect((narrative.contents[0] as { text: string }).text).toContain('Customer tells Order to Clerk');
    const egn = await client.readResource({ uri: 'egon://stories/order-pizza/egn' });
    expect((egn.contents[0] as { mimeType: string }).mimeType).toBe('application/json');
    const guide = await client.readResource({ uri: 'egon://guide/domain-storytelling' });
    expect((guide.contents[0] as { text: string }).text).toContain('work object');
    expect((guide.contents[0] as { text: string }).text).toContain('give every sentence its own work objects');
    expect((guide.contents[0] as { text: string }).text).toContain('assumptions that keep the story on one path');
  });

  it('offers prompts for modeling and reviewing domain stories', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual(
      expect.arrayContaining(['model_domain_story', 'review_domain_story', 'domain_story_interview']),
    );
    const prompt = await client.getPrompt({ name: 'model_domain_story', arguments: { process: 'Ordering pizza by phone' } });
    const message = prompt.messages[0]?.content as { text: string };
    expect(message.text).toContain('Ordering pizza by phone');
    expect(message.text).toContain('build_story');
  });

  it('offers a prompt that cuts a coarse story into subdomains', async () => {
    const prompt = await client.getPrompt({ name: 'find_subdomains', arguments: { storyId: 'repair-a-bicycle' } });
    const text = (prompt.messages[0]?.content as { text: string }).text;
    expect(text).toContain('repair-a-bicycle');
    expect(text).toMatch(/add_group with steps/);
    expect(text).toMatch(/flows one way/);
    expect(text).toMatch(/subdomains, not bounded contexts/);
  });
});
