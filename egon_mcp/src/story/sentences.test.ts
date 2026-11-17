import { describe, expect, it } from 'vitest';
import { boundsOf } from './geometry.js';
import type { ShapeElement } from '../egon/types.js';
import { parseStoryFile } from '../egon/parse.js';
import { toEgnJson } from '../egon/serialize.js';
import { isActor, isWorkObject } from '../egon/types.js';
import { narrate } from './narrate.js';
import { membersOfSteps, addSentence, buildStory, groupBySteps } from './sentences.js';
import { Story } from './story.js';
import { validateStory } from './validate.js';

describe('addSentence', () => {
  it('creates missing actors and work objects and links them in one step', () => {
    const story = Story.create({ title: 'T' });
    const result = addSentence(story, {
      actor: 'Customer',
      activity: 'tells',
      workObject: 'Order',
      to: [{ activity: 'to', actor: 'Clerk' }],
    });
    expect(result.number).toBe(1);
    expect(result.created.map((e) => e.name)).toEqual(['Customer', 'Order', 'Clerk']);
    expect(narrate(story.toDocument())[0]?.sentence).toBe('Customer tells Order to Clerk.');
  });

  it('reuses actors by name but draws a new work object for each sentence, as in Egon practice', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Customer', activity: 'tells', workObject: 'Order', to: [{ activity: 'to', actor: 'Clerk' }] });
    const second = addSentence(story, { actor: 'clerk', activity: 'passes', workObject: 'Order', to: [{ activity: 'to', actor: 'Baker' }] });
    expect(second.created.map((e) => e.name)).toEqual(['Order', 'Baker']);
    expect(story.elements().filter(isActor)).toHaveLength(3);
    expect(story.elements().filter(isWorkObject)).toHaveLength(2);
    expect(narrate(story.toDocument()).map((s) => s.sentence)).toEqual([
      'Customer tells Order to Clerk.',
      'Clerk passes Order to Baker.',
    ]);
  });

  it('reuses the latest work object of that name when asked to', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Clerk', activity: 'writes', workObject: 'Order slip' });
    const second = addSentence(story, { actor: 'Clerk', activity: 'signs', workObject: 'order slip', reuseWorkObject: true });
    expect(second.created).toEqual([]);
    expect(story.elements().filter(isWorkObject)).toHaveLength(1);
  });

  it('reuses a work object given by id', () => {
    const story = Story.create({ title: 'T' });
    const first = addSentence(story, { actor: 'Clerk', activity: 'writes', workObject: 'Order slip' });
    const slip = first.created.find((e) => e.name === 'Order slip')!;
    expect(addSentence(story, { actor: 'Clerk', activity: 'signs', workObject: slip.id }).created).toEqual([]);
  });

  it('uses the given icons for new elements and a matching built-in icon by name otherwise', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Shop system', actorIcon: 'System', activity: 'sends', workObject: 'Email' });
    const types = story.elements().map((e) => e.type);
    expect(types).toContain('domainStory:actorSystem');
    expect(types).toContain('domainStory:workObjectEmail');
  });

  it('gives a repeated work object the icon and color of the previous one', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Baker', activity: 'bakes', workObject: 'Pizza', workObjectIcon: 'Dining' });
    story.updateElement(story.elements().find((e) => e.name === 'Pizza')!.id, { color: '#E53935' });
    addSentence(story, { actor: 'Clerk', activity: 'serves', workObject: 'Pizza' });
    const pizzas = story.elements().filter((e) => e.name === 'Pizza');
    expect(pizzas.map((e) => e.type)).toEqual(['domainStory:workObjectDining', 'domainStory:workObjectDining']);
    expect(pizzas.map((e) => e.pickedColor)).toEqual(['#E53935', '#E53935']);
  });

  it('checks work object names in every case', () => {
    const story = Story.create({ title: 'T' });
    expect(() => addSentence(story, { actor: 'A', activity: 'does', workObject: '   ' })).toThrow(/name/);
    addSentence(story, { actor: 'Customer', activity: 'fills in', workObject: 'Form' });
    expect(() => addSentence(story, { actor: 'Clerk', activity: 'notes', workObject: 'Customer' })).toThrow(/already a actor/);
    const actorId = story.elements().find((e) => e.name === 'Customer')!.id;
    expect(() => addSentence(story, { actor: 'Clerk', activity: 'notes', workObject: actorId })).toThrow(/not a work object/);
  });

  it('adds parallel activities to an existing step', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'A', activity: 'fills in', workObject: 'Form' });
    const parallel = addSentence(story, { actor: 'B', activity: 'reads', workObject: 'Form', number: 1 });
    expect(parallel.number).toBe(1);
  });

  it('refuses to use a work object as the actor of a sentence', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'A', activity: 'fills in', workObject: 'Form' });
    expect(() => addSentence(story, { actor: 'Form', activity: 'x', workObject: 'Y' })).toThrow(/work object/);
  });

  it('supports a sentence that addresses another actor through a work object', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Customer', activity: 'calls', workObject: 'Phone call', workObjectIcon: 'Call', to: [{ actor: 'Waiter' }] });
    expect(narrate(story.toDocument())[0]?.sentence).toBe('Customer calls Phone call [unlabeled activity] Waiter.');
  });
});

describe('buildStory', () => {
  it('builds and lays out a complete story from sentences', () => {
    const story = buildStory({
      title: 'Order pizza',
      description: 'Happy path',
      scope: { pointInTime: 'as-is', granularity: 'coarse-grained' },
      actors: [{ name: 'Pizza baker', icon: 'Person', color: '#FB8C00' }],
      sentences: [
        { actor: 'Customer', activity: 'tells', workObject: 'Order', to: [{ activity: 'to', actor: 'Clerk' }] },
        { actor: 'Clerk', activity: 'writes', workObject: 'Order slip', to: [{ activity: 'for', actor: 'Pizza baker' }] },
        { actor: 'Pizza baker', activity: 'bakes', workObject: 'Pizza', workObjectIcon: 'Dining' },
      ],
      groups: [{ name: 'Kitchen', members: ['Pizza baker', 'Pizza'] }],
      annotations: [{ text: 'Handwritten', attachTo: 'Order slip' }],
    });
    const doc = story.toDocument();
    expect(doc.title).toBe('Order pizza');
    expect(narrate(doc).map((s) => s.sentence)).toEqual([
      'Customer tells Order to Clerk.',
      'Clerk writes Order slip for Pizza baker.',
      'Pizza baker bakes Pizza.',
    ]);
    expect(doc.elements.find((e) => e.name === 'Pizza baker')?.pickedColor).toBe('#FB8C00');
    expect(validateStory(doc)).toEqual([]);
  });

  it('uses work objects declared up front in the first sentence that names them', () => {
    const story = buildStory({
      title: 'T',
      workObjects: [{ name: 'Pizza', icon: 'Dining', color: '#E53935' }],
      sentences: [
        { actor: 'Baker', activity: 'bakes', workObject: 'Pizza' },
        { actor: 'Clerk', activity: 'serves', workObject: 'Pizza' },
      ],
    });
    const pizzas = story.elements().filter((e) => e.name === 'Pizza');
    expect(pizzas).toHaveLength(2);
    expect(pizzas.every((e) => e.type === 'domainStory:workObjectDining' && e.pickedColor === '#E53935')).toBe(true);
    expect(validateStory(story.toDocument())).toEqual([]);
  });

  it('gives a declared work object the icon its first sentence asks for', () => {
    const story = buildStory({
      title: 'T',
      workObjects: [{ name: 'Pizza' }],
      sentences: [{ actor: 'Baker', activity: 'bakes', workObject: 'Pizza', workObjectIcon: 'Dining' }],
    });
    const pizzas = story.elements().filter((e) => e.name === 'Pizza');
    expect(pizzas.map((e) => e.type)).toEqual(['domainStory:workObjectDining']);

    const other = Story.create({ title: 'T' });
    other.addWorkObject({ name: 'Order', icon: 'Email' });
    addSentence(other, { actor: 'Clerk', activity: 'prints', workObject: 'Order', workObjectIcon: 'Document' });
    expect(other.elements().filter((e) => e.name === 'Order').map((e) => e.type)).toEqual(['domainStory:workObjectDocument']);
  });

  it('keeps the color of a declared work object when a later sentence picks another icon', () => {
    const story = buildStory({
      title: 'T',
      workObjects: [{ name: 'Pizza', icon: 'Dining', color: '#E53935' }],
      sentences: [
        { actor: 'Baker', activity: 'bakes', workObject: 'Pizza' },
        { actor: 'Clerk', activity: 'boxes', workObject: 'Pizza', workObjectIcon: 'Document' },
      ],
    });
    const pizzas = story.elements().filter((e) => e.name === 'Pizza');
    expect(pizzas.map((e) => e.pickedColor)).toEqual(['#E53935', '#E53935']);
    expect(pizzas.map((e) => e.type)).toEqual(['domainStory:workObjectDining', 'domainStory:workObjectDocument']);
  });

  it('attaches notes and group members to the actor, not to a group of the same name', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Kitchen', activity: 'bakes', workObject: 'Pizza', to: [{ activity: 'for', actor: 'Waiter' }] },
      ],
      groups: [
        { name: 'Kitchen', members: ['Kitchen', 'Pizza'] },
        { name: 'Restaurant', members: ['Kitchen', 'Waiter'] },
      ],
      annotations: [{ text: 'Wood-fired', attachTo: 'Kitchen' }],
    });
    const actor = story.elements().find(isActor)!;
    const [kitchenGroup, restaurant] = ['Kitchen', 'Restaurant'].map((name) =>
      story.elements().find((e) => e.type === 'domainStory:group' && e.name === name),
    );
    expect(kitchenGroup).not.toHaveProperty('parent');
    expect(actor['parent']).toBe(restaurant?.id);
    const connection = story.elements().find((e) => e.type === 'domainStory:connection');
    expect(connection?.['source']).toBe(actor.id);
  });

  it('reuses the same work object before and after a save, whatever the ids', () => {
    const file = JSON.stringify({ domain: { name: 'default', actors: {}, workObjects: {} }, dst: [{ type: 'domainStory:actorPerson', id: 'shape_9998', name: 'Clerk', x: 0, y: 0 }, { info: '' }, { version: '3.2.1' }] });
    const story = Story.fromDocument(parseStoryFile(file, 'story.egn'));
    addSentence(story, { actor: 'Clerk', activity: 'drafts', workObject: 'Report' });
    addSentence(story, { actor: 'Clerk', activity: 'revises', workObject: 'Report' });
    const reopened = Story.fromDocument(parseStoryFile(toEgnJson(story.toDocument()), 'story.egn'));
    const reuse = (of: Story) => addSentence(of, { actor: 'Clerk', activity: 'files', workObject: 'Report', reuseWorkObject: true });
    const target = (of: Story) => of.elements().filter((element) => element.type === 'domainStory:activity').at(-1)?.['target'];
    reuse(story);
    reuse(reopened);
    expect(target(reopened)).toBe(target(story));
  });

  it('groups the work objects of numbered sentences and leaves their actors outside', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Repair estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike' },
        { actor: 'Customer', activity: 'pays', workObject: 'Repair price', to: [{ activity: 'to', actor: 'Cashier' }] },
      ],
      groups: [
        { name: 'Repair acceptance', steps: [1, 2] },
        { name: 'Payment', steps: [4], members: ['Cashier'] },
      ],
    });
    const byGroup = (name: string) => {
      const group = story.elements().find((element) => element.type === 'domainStory:group' && element.name === name)!;
      return story.elements().filter((element) => element['parent'] === group.id).map((element) => element.name).sort();
    };
    expect(byGroup('Repair acceptance')).toEqual(['Bike', 'Repair estimate']);
    expect(byGroup('Payment')).toEqual(['Cashier', 'Repair price']);
    // The Bike of step 3 is a copy of its own and stays out of the group.
    expect(story.elements().filter((element) => element.name === 'Bike' && element['parent'] === undefined)).toHaveLength(1);
    expect(() => buildStory({ title: 'T', sentences: [{ actor: 'A', activity: 'does', workObject: 'W' }], groups: [{ name: 'G', steps: [7] }] })).toThrow(/no step 7/);
  });

  it('takes an outer group whole when the groups inside it are named', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Clerk', activity: 'orders', workObject: 'Part' },
        { actor: 'Cashier', activity: 'writes', workObject: 'Invoice' },
      ],
      groups: [
        { name: 'Intake', steps: [1, 2] },
        { name: 'Purchasing', steps: [3] },
        { name: 'Repair', steps: [1, 2, 3] },
      ],
    });
    const find = (name: string) => story.elements().find((element) => element.name === name)!;
    const shop = story.addGroup({ name: 'Shop', members: [find('Intake').id, find('Purchasing').id, 'Invoice'] });
    expect([find('Repair')['parent'], find('Invoice')['parent']]).toEqual([shop.id, shop.id]);
  });

  it('puts an existing group that the steps cover whole into the new group, so inner groups may come first', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike' },
      ],
      groups: [
        { name: 'Intake', steps: [1, 2] },
        { name: 'Workshop', steps: [1, 2, 3] },
      ],
    });
    const groups = story.elements().filter((element) => element.type === 'domainStory:group');
    const workshop = groups.find((group) => group.name === 'Workshop')!;
    const intake = groups.find((group) => group.name === 'Intake')!;
    expect(intake['parent']).toBe(workshop.id);
    expect(story.elements().filter((element) => element['parent'] === intake.id).map((element) => element.name).sort()).toEqual(['Bike', 'Estimate']);
    // The same steps again give a box around the first one.
    const twice = buildStory({
      title: 'T',
      sentences: [{ actor: 'A', activity: 'does', workObject: 'W' }],
      groups: [
        { name: 'One', steps: [1] },
        { name: 'Two', steps: [1] },
      ],
    });
    const named = (name: string) => twice.elements().find((element) => element.name === name)!;
    expect([named('One')['parent'], named('W')['parent']]).toEqual([named('Two').id, named('One').id]);
  });

  it('nests a group of some steps of an outer group even when its box is as large, and grows the outer group', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike' },
      ],
      groups: [
        { name: 'Workshop', steps: [1, 2, 3] },
        { name: 'Odd', steps: [1, 3] },
      ],
      layout: false,
    });
    const groups = story.elements().filter((element) => element.type === 'domainStory:group') as ShapeElement[];
    const workshop = groups.find((group) => group.name === 'Workshop')!;
    const odd = groups.find((group) => group.name === 'Odd')!;
    expect(odd['parent']).toBe(workshop.id);
    const area = (group: ShapeElement) => (group['width'] as number) * (group['height'] as number);
    expect(area(workshop)).toBeGreaterThan(area(odd));
  });

  it('takes a group in whole when all of it is among the members, so no group is emptied', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
      ],
      groups: [{ name: 'Pricing', members: ['Estimate'] }],
    });
    const intake = story.addGroup({ name: 'Intake', members: ['Bike', 'Estimate'] });
    const find = (name: string) => story.elements().find((element) => element.name === name)!;
    expect(find('Pricing')['parent']).toBe(intake.id);
    expect(find('Estimate')['parent']).toBe(find('Pricing').id);
    // Naming the group itself wraps it.
    const around = story.addGroup({ name: 'Around', members: ['Pricing'] });
    expect([find('Pricing')['parent'], around['parent']]).toEqual([around.id, intake.id]);
    // Naming all that a group holds draws a box around that group, here around Around.
    const again = story.addGroup({ name: 'Again', members: ['Estimate'] });
    expect([find('Around')['parent'], again['parent']]).toEqual([again.id, intake.id]);
  });

  it('moves members out of a group that also holds something else', () => {
    const story = buildStory({
      title: 'T',
      sentences: [{ actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] }],
      groups: [{ name: 'Workshop', members: ['Mechanic', 'Estimate'] }],
    });
    const paperwork = story.addGroup({ name: 'Paperwork', members: ['Estimate', 'Customer'] });
    const find = (name: string) => story.elements().find((element) => element.name === name)!;
    expect([find('Estimate')['parent'], find('Customer')['parent'], paperwork['parent']]).toEqual([paperwork.id, paperwork.id, undefined]);
    expect(find('Mechanic')['parent']).toBe(find('Workshop').id);
  });

  it('grows every group around a nested one, so each stays larger, and reroutes their arrows', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addWorkObject({ name: 'A', x: 0, y: 0 });
    const b = story.addWorkObject({ name: 'B', x: 400, y: 0 });
    const c = story.addWorkObject({ name: 'C', x: 800, y: 0 });
    const middle = story.addGroup({ name: 'Middle', members: [a.id, b.id, c.id] });
    const outer = story.addGroup({ name: 'Outer', members: [middle.id] });
    const { connection } = story.addAnnotation({ text: 'about Outer', attachTo: outer.id, x: 2000, y: 0 });
    story.addGroup({ name: 'Ends', members: [a.id, c.id] });
    const area = (id: string) => {
      const box = boundsOf(story.get(id) as ShapeElement);
      return box.width * box.height;
    };
    const ends = story.elements().find((element) => element.name === 'Ends')!;
    expect(area(middle.id)).toBeGreaterThan(area(ends.id));
    expect(area(outer.id)).toBeGreaterThan(area(middle.id));
    const link = story.get(connection!.id) as { waypoints: { x: number; y: number }[] };
    const box = boundsOf(story.get(outer.id) as ShapeElement);
    expect(link.waypoints[0]!.x).toBeGreaterThanOrEqual(box.x + box.width - 1);
  });

  it('draws a fitted box around the notes of its members, and lets an x/y box go inside the group it sits in', () => {
    const story = Story.create({ title: 'T' });
    const part = story.addWorkObject({ name: 'Part', x: 300, y: 300 });
    const note = story.addAnnotation({ text: 'weekly', attachTo: part.id }).annotation;
    const box = story.addGroup({ name: 'Purchasing', members: [part.id] });
    expect(story.get(note.id)?.['parent']).toBe(box.id);
    const inside = boundsOf(story.get(box.id) as ShapeElement);
    const corner = story.get(note.id) as ShapeElement;
    expect(corner.y).toBeGreaterThanOrEqual(inside.y);
    const g = story.addGroup({ name: 'G', x: 2000, y: 0, width: 800, height: 600 });
    const a = story.addWorkObject({ name: 'A', x: 2100, y: 100 });
    expect(story.get(a.id)?.['parent']).toBe(g.id);
    const sub = story.addGroup({ name: 'Sub', x: 2050, y: 50, width: 300, height: 200 });
    expect([story.get(sub.id)?.['parent'], story.get(a.id)?.['parent']]).toEqual([g.id, sub.id]);
  });

  it('refuses to grow a group past a billion pixels', () => {
    // The new box fits within the limit, but the group around it would have to grow past it.
    const story = Story.create({ title: 'T' });
    const a = story.addWorkObject({ name: 'A', x: -999_999_950, y: 0 });
    const b = story.addWorkObject({ name: 'B', x: -999_999_500, y: 0 });
    const third = story.addWorkObject({ name: 'C', x: -999_999_000, y: 0 });
    story.addGroup({ name: 'Edge', members: [a.id, b.id, third.id] });
    const before = JSON.stringify(story.toDocument());
    expect(() => story.addGroup({ name: 'Both', members: [a.id, b.id] })).toThrow(/"Edge" would have to grow past a billion pixels/);
    expect(JSON.stringify(story.toDocument())).toBe(before);
  });

  it('nests a group made from some of the steps of another group inside it', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike' },
      ],
      groups: [
        { name: 'Workshop', steps: [1, 2, 3] },
        { name: 'Intake', steps: [1, 2] },
      ],
    });
    const groups = story.elements().filter((element) => element.type === 'domainStory:group');
    const workshop = groups.find((group) => group.name === 'Workshop')!;
    expect(groups.find((group) => group.name === 'Intake')?.['parent']).toBe(workshop.id);
  });

  it('wants members or steps for a group in build_story', () => {
    expect(() => buildStory({ title: 'T', sentences: [{ actor: 'A', activity: 'does', workObject: 'W' }], groups: [{ name: 'Empty' }] })).toThrow(/members or steps/);
  });

  it('puts every instance of a name into a group and attaches annotations to the first one', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Clerk', activity: 'writes', workObject: 'Slip' },
        { actor: 'Clerk', activity: 'stamps', workObject: 'Slip' },
      ],
      groups: [{ name: 'Desk', members: ['Clerk', 'Slip'] }],
      annotations: [{ text: 'Paper', attachTo: 'Slip' }],
    });
    const group = story.elements().find((e) => e.type === 'domainStory:group')!;
    // The note lands next to the first Slip, inside the box, so it joins the group as it would in Egon.
    expect(story.elements().filter((e) => e['parent'] === group.id).map((e) => e.name || e['text'])).toEqual(['Clerk', 'Slip', 'Slip', 'Paper']);
    expect(story.elements().filter((e) => e.type === 'domainStory:connection')).toHaveLength(1);
  });

  it('names the failing sentence in errors', () => {
    expect(() =>
      buildStory({
        title: 'T',
        sentences: [
          { actor: 'A', activity: 'fills in', workObject: 'Form' },
          { actor: 'B', actorIcon: 'Nonsense', activity: 'reads', workObject: 'Form' },
        ],
      }),
    ).toThrow(/sentence 2/i);
  });
});

describe('groups hold what you name', () => {
  const parentOf = (story: Story, id: string) => story.get(id)?.['parent'];
  const shop = [
    { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
    { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
    { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike', reuseWorkObject: true },
  ];

  it('gives a work object that later steps use too to the step that drew it', () => {
    const story = buildStory({ title: 'T', sentences: shop, groups: [{ name: 'Intake', steps: [1, 2] }] });
    const bike = story.elements().find((element) => element.name === 'Bike')!;
    const intake = story.elements().find((element) => element.name === 'Intake')!;
    expect(bike['parent']).toBe(intake.id);
    expect(() => membersOfSteps(story, [3])).toThrow(/Step 3 has no work object of its own/);
    // Shared through an onward arrow: the folder first appears in step 1.
    const filing = buildStory({ title: 'T', sentences: [{ actor: 'Clerk', activity: 'puts', workObject: 'Letter' }] });
    const letter = filing.elements().find((element) => element.name === 'Letter')!;
    const folder = filing.addWorkObject({ name: 'Folder' });
    filing.addActivity({ from: letter.id, to: folder.id, label: 'into' });
    addSentence(filing, { actor: 'Clerk', activity: 'files', workObject: folder.id });
    expect(membersOfSteps(filing, [1]).sort()).toEqual([folder.id, letter.id].sort());
    expect(() => membersOfSteps(filing, [2])).toThrow(/Step 2 has no work object of its own/);
  });

  it('moves a work object that is named next to steps into that group', () => {
    const story = buildStory({
      title: 'T',
      sentences: shop,
      groups: [
        { name: 'Intake', steps: [1, 2] },
        { name: 'Repair', steps: [3], members: ['Bike'] },
      ],
    });
    const find = (name: string) => story.elements().find((element) => element.name === name)!;
    expect([find('Bike')['parent'], find('Estimate')['parent']]).toEqual([find('Repair').id, find('Intake').id]);
  });

  it('keeps a note on a group with it when the group goes into another one whole', () => {
    const story = buildStory({ title: 'T', sentences: shop, groups: [{ name: 'Intake', steps: [1, 2] }] });
    const intake = story.elements().find((element) => element.name === 'Intake')!;
    const note = story.addAnnotation({ text: 'one customer at a time', attachTo: intake.id }).annotation;
    story.addWorkObject({ name: 'Invoice' });
    const shopGroup = story.addGroup({ name: 'Shop', members: [intake.id, 'Invoice'] });
    expect([parentOf(story, intake.id), parentOf(story, note.id)]).toEqual([shopGroup.id, intake.id]);
  });

  const groupsOf = (story: Story) => {
    const elements = story.elements();
    const label = (element: (typeof elements)[number]) => element.name || String(element['text'] ?? element.id);
    const inside = (id: string | undefined): string =>
      elements
        .filter((element) => element['parent'] === id && !['domainStory:activity', 'domainStory:connection'].includes(element.type))
        .filter((element) => id !== undefined || element.type === 'domainStory:group')
        .map((element) => (element.type === 'domainStory:group' ? `${label(element)}[${inside(element.id)}]` : label(element)))
        .sort()
        .join(' ');
    return inside(undefined);
  };
  const parts = [
    { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
    { actor: 'Mechanic', activity: 'notes', workObject: 'Part request', to: [{ activity: 'for', actor: 'Clerk' }] },
    { actor: 'Clerk', activity: 'reads', workObject: 'Part request', reuseWorkObject: true },
    { actor: 'Clerk', activity: 'orders', workObject: 'Part' },
  ];
  const both = <T,>(a: T, b: T) => [
    [a, b],
    [b, a],
  ];

  it('nests groups by steps the same way whatever the order of the list', () => {
    for (const groups of both({ name: 'Intake', steps: [1, 2] }, { name: 'Workshop', steps: [1, 2, 3] })) {
      expect(groupsOf(buildStory({ title: 'T', sentences: shop, groups }))).toBe('Workshop[Intake[Bike Estimate]]');
    }
    for (const groups of both({ name: 'Pricing', steps: [2] }, { name: 'Workshop', steps: [2, 3] })) {
      expect(groupsOf(buildStory({ title: 'T', sentences: shop, groups }))).toBe('Workshop[Pricing[Estimate]]');
    }
  });

  it('puts a group whose steps bring nothing of their own beside the group it takes a named work object from', () => {
    for (const groups of both({ name: 'Intake', steps: [1, 2] }, { name: 'Repair', steps: [3], members: ['Bike'] })) {
      expect(groupsOf(buildStory({ title: 'T', sentences: shop, groups }))).toBe('Intake[Estimate] Repair[Bike]');
    }
  });

  it('leaves a work object where a group named it, whatever the order', () => {
    for (const groups of both({ name: 'Purchasing', steps: [3, 4], members: ['Part request'] }, { name: 'Intake', steps: [1, 2] })) {
      expect(groupsOf(buildStory({ title: 'T', sentences: parts, groups }))).toBe('Intake[Bike] Purchasing[Part Part request]');
    }
    // The same with add_group, the receiving group drawn first.
    const story = buildStory({ title: 'T', sentences: parts, groups: [{ name: 'Purchasing', steps: [3, 4], members: ['Part request'] }] });
    groupBySteps(story, { name: 'Intake', steps: [1, 2] });
    expect(groupsOf(story)).toBe('Intake[Bike] Purchasing[Part Part request]');
  });

  it('reads a name next to steps as the copies those steps use', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'checks', workObject: 'Bike', reuseWorkObject: true },
        { actor: 'Mechanic', activity: 'returns', workObject: 'Bike', to: [{ activity: 'to', actor: 'Customer' }] },
      ],
      groups: [
        { name: 'Intake', steps: [1] },
        { name: 'Handover', steps: [3] },
        { name: 'Check', steps: [2], members: ['Bike'] },
      ],
    });
    // Check takes only the copy that step 2 uses; Intake held nothing else, so it goes along whole.
    expect(groupsOf(story)).toBe('Check[Intake[Bike]] Handover[Bike]');
  });

  it('refuses steps whose work objects all sit in other groups, and says where', () => {
    const story = buildStory({ title: 'T', sentences: parts, groups: [{ name: 'Purchasing', steps: [3, 4], members: ['Part request'] }] });
    story.addGroup({ name: 'Stock', members: ['Bike', 'Part'] });
    expect(() => groupBySteps(story, { name: 'Intake', steps: [1, 2] })).toThrow(/"Bike" in "Stock", "Part request" in "Purchasing"/);
  });

  it('moves a note with the element of its lowest-id link only, and ignores a link to a missing note', () => {
    const text = JSON.stringify({
      domain: { name: 'default', actors: {}, workObjects: {} },
      dst: [
        { type: 'domainStory:group', id: 'zg', name: 'ZG', x: 0, y: 0, width: 600, height: 400 },
        { type: 'domainStory:workObjectDocument', id: 'z', name: 'Z', x: 100, y: 100, parent: 'zg' },
        { type: 'domainStory:textAnnotation', id: 'n', text: 'about Z', x: 300, y: 100, width: 100, height: 30, parent: 'zg' },
        { type: 'domainStory:workObjectDocument', id: 'x', name: 'X', x: 1000, y: 100 },
        { type: 'domainStory:connection', id: 'c1', source: 'z', target: 'n', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { type: 'domainStory:connection', id: 'c2', source: 'x', target: 'n', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { type: 'domainStory:connection', id: 'c3', source: 'x', target: 'shape_404', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { type: 'domainStory:group', id: 'mg', name: 'MG', x: 2000, y: 0, width: 600, height: 400 },
        { type: 'domainStory:textAnnotation', id: 'm', text: 'about X', x: 2100, y: 100, width: 100, height: 30, parent: 'mg' },
        { type: 'domainStory:connection', id: 'c4', source: 'x', target: 'm', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { info: '' },
        { version: '3.2.1' },
      ],
    });
    const story = Story.fromDocument(parseStoryFile(text, 'story.egn'));
    story.addGroup({ name: 'New', members: ['x'] });
    // The note on X moves out of MG with it; the note on Z stays, as its lowest-id link is from Z.
    expect(groupsOf(story)).toBe('MG[] New[X about X] ZG[Z about Z]');
  });

  it('draws an empty members list with x and y like any box', () => {
    const story = Story.create({ title: 'T' });
    expect(() => story.addGroup({ name: 'G', members: [], x: 0, y: 0, width: 300, height: 200 })).not.toThrow();
  });

  it('refuses members together with x and y', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addWorkObject({ name: 'A', x: 100, y: 100 });
    expect(() => story.addGroup({ name: 'G', members: [a.id], x: 0, y: 0, width: 500, height: 500 })).toThrow(/not both/);
  });

  it('settles a shared work object named by a later group, whatever the order of the groups', () => {
    const sentences = [
      { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
      { actor: 'Mechanic', activity: 'notes', workObject: 'Part request', to: [{ activity: 'for', actor: 'Clerk' }] },
      { actor: 'Clerk', activity: 'reads', workObject: 'Part request', reuseWorkObject: true },
      { actor: 'Clerk', activity: 'orders', workObject: 'Part' },
    ];
    const intake = { name: 'Intake', steps: [1, 2], members: ['Part request'] };
    const purchasing = { name: 'Purchasing', steps: [3, 4] };
    const homes = (story: Story) => {
      const nameOf = (id: unknown) => story.elements().find((element) => element.id === id)?.name;
      return story.elements().filter(isWorkObject).map((element) => `${element.name}:${nameOf(element['parent'])}`).sort();
    };
    const first = buildStory({ title: 'T', sentences, groups: [intake, purchasing] });
    const second = buildStory({ title: 'T', sentences, groups: [purchasing, intake] });
    expect(homes(second)).toEqual(homes(first));
    expect(homes(first)).toContain('Part request:Intake');
  });

  it('takes the group around a named group and a work object whole when they are all it holds', () => {
    const story = Story.create({ title: 'T' });
    const q = story.addGroup({ name: 'Q', x: 0, y: 0, width: 2000, height: 2000 });
    const p = story.addGroup({ name: 'P', x: 100, y: 100, width: 400, height: 300 });
    const inP = story.addWorkObject({ name: 'In P', x: 150, y: 150 });
    const x = story.addWorkObject({ name: 'X', x: 800, y: 800 });
    expect([parentOf(story, p.id), parentOf(story, inP.id), parentOf(story, x.id)]).toEqual([q.id, p.id, q.id]);
    // P and X are all that Q holds, so Q goes into the new box whole.
    const both = story.addGroup({ name: 'Both', members: [p.id, x.id] });
    expect([parentOf(story, q.id), parentOf(story, both.id)]).toEqual([both.id, undefined]);
  });

  it('says so when the steps have no work object', () => {
    const text = JSON.stringify({
      domain: { name: 'default', actors: {}, workObjects: {} },
      dst: [
        { type: 'domainStory:actorPerson', id: 'a', name: 'Clerk', x: 100, y: 100 },
        { type: 'domainStory:activity', id: 'c1', name: 'files', number: 1, source: 'a', target: 'gone', waypoints: [] },
        { info: '' },
        { version: '3.2.1' },
      ],
    });
    const story = Story.fromDocument(parseStoryFile(text, 'story.egn'));
    expect(() => membersOfSteps(story, [1])).toThrow(/Step 1 reaches no work object at all/);
  });
});
