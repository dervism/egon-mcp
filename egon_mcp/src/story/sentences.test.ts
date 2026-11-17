import { describe, expect, it } from 'vitest';
import { boundsOf } from './geometry.js';
import type { ShapeElement } from '../egon/types.js';
import { parseStoryFile } from '../egon/parse.js';
import { toEgnJson } from '../egon/serialize.js';
import { isActor, isWorkObject } from '../egon/types.js';
import { narrate } from './narrate.js';
import { membersOfSteps, addSentence, buildStory } from './sentences.js';
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

  it('refuses to group by steps a work object that also serves a sentence outside them', () => {
    const shared = () =>
      buildStory({
        title: 'T',
        sentences: [
          { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
          { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
          { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike', reuseWorkObject: true },
        ],
        groups: [{ name: 'Intake', steps: [1, 2] }],
      });
    expect(shared).toThrow(/"Bike" in step 1 is used by step 3 too/);
    // Shared through an onward arrow, without reuseWorkObject.
    const story = buildStory({ title: 'T', sentences: [{ actor: 'Clerk', activity: 'puts', workObject: 'Letter' }] });
    const letter = story.elements().find((element) => element.name === 'Letter')!;
    const folder = story.addWorkObject({ name: 'Folder' });
    story.addActivity({ from: letter.id, to: folder.id, label: 'into' });
    addSentence(story, { actor: 'Clerk', activity: 'files', workObject: folder.id });
    expect(() => membersOfSteps(story, [1])).toThrow(/"Folder" in step 1 is used by step 2 too/);
    expect(() => membersOfSteps(story, [1, 2])).not.toThrow();
  });

  it('does not take a shared work object in the group around all its steps as decided', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'notes', workObject: 'Part request', to: [{ activity: 'for', actor: 'Clerk' }] },
        { actor: 'Clerk', activity: 'reads', workObject: 'Part request', reuseWorkObject: true },
        { actor: 'Clerk', activity: 'orders', workObject: 'Part' },
      ],
      groups: [{ name: 'Repair', steps: [1, 2, 3, 4] }],
    });
    expect(() => membersOfSteps(story, [1, 2])).toThrow(/is used by step 3 too/);
    // Naming it in the same call settles where it goes.
    const request = story.elements().find((element) => element.name === 'Part request')!;
    expect(() => membersOfSteps(story, [1, 2], [request.id])).not.toThrow();
    const intake = story.addGroup({ name: 'Intake', members: [request.id, ...membersOfSteps(story, [1, 2], [request.id])] });
    expect(story.get(request.id)?.['parent']).toBe(intake.id);
  });

  it('reads a member name next to steps as the copies those steps use', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'notes', workObject: 'Part request', to: [{ activity: 'for', actor: 'Clerk' }] },
        { actor: 'Clerk', activity: 'reads', workObject: 'Part request', reuseWorkObject: true },
        { actor: 'Clerk', activity: 'orders', workObject: 'Part' },
        { actor: 'Mechanic', activity: 'files', workObject: 'Part request' },
      ],
      groups: [
        { name: 'Filing', steps: [5] },
        { name: 'Intake', steps: [1, 2], members: ['Part request'] },
        { name: 'Purchasing', steps: [3, 4] },
      ],
    });
    const groups = story.elements().filter((element) => element.type === 'domainStory:group');
    const named = (name: string) => groups.find((group) => group.name === name)!;
    expect(groups.map((group) => group['parent'])).toEqual([undefined, undefined, undefined]);
    const contents = (name: string) => story.elements().filter((element) => element['parent'] === named(name).id).map((element) => element.name).sort();
    expect([contents('Filing'), contents('Intake'), contents('Purchasing')]).toEqual([['Part request'], ['Bike', 'Part request'], ['Part']]);
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

  it('works out the group around shared work objects when the steps have no others', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'notes', workObject: 'Part request', to: [{ activity: 'for', actor: 'Clerk' }] },
        { actor: 'Clerk', activity: 'reads', workObject: 'Part request', reuseWorkObject: true },
      ],
      groups: [{ name: 'Repair', steps: [1, 2, 3] }],
    });
    expect(() => membersOfSteps(story, [2])).toThrow(/nothing left to group\. To move one into this group, pass it in members/);
  });

  it('names the member outside every group when the new box would cross one', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Clerk', activity: 'orders', workObject: 'Part' },
      ],
      groups: [{ name: 'Repair', steps: [1, 2, 3] }],
    });
    const mechanic = story.elements().find((element) => element.name === 'Mechanic')!;
    expect(() => membersOfSteps(story, [1, 2], [mechanic.id])).toThrow(/"Mechanic" is in no group/);
  });

  it('takes a group whole even with a note on the group itself', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike' },
      ],
      groups: [{ name: 'Intake', steps: [1, 2] }],
    });
    const intake = story.elements().find((element) => element.name === 'Intake')!;
    story.addAnnotation({ text: 'one customer at a time', attachTo: intake.id });
    expect(membersOfSteps(story, [1, 2, 3])).toContain(intake.id);
    expect(() => membersOfSteps(story, [1, 2])).toThrow(/already the group "Intake"/);
  });

  it('says what keeps a group from going in whole', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
      ],
      groups: [{ name: 'Workshop', members: ['Mechanic', 'Estimate'] }],
    });
    expect(() => membersOfSteps(story, [1, 2])).toThrow(/"Workshop", which also holds the actor "Mechanic"/);
  });

  it('leaves a shared work object in the group it was given, once that is decided', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'notes', workObject: 'Part request', to: [{ activity: 'for', actor: 'Clerk' }] },
        { actor: 'Clerk', activity: 'reads', workObject: 'Part request', reuseWorkObject: true },
        { actor: 'Clerk', activity: 'orders', workObject: 'Part' },
      ],
    });
    expect(() => membersOfSteps(story, [3, 4])).toThrow(/is used by step 2 too/);
    const intake = story.addGroup({ name: 'Intake', members: ['Bike', 'Part request'] });
    const purchasing = story.addGroup({ name: 'Purchasing', members: membersOfSteps(story, [3, 4]) });
    const find = (name: string) => story.elements().find((element) => element.name === name)!;
    expect([find('Part request')['parent'], find('Part')['parent']]).toEqual([intake.id, purchasing.id]);
    expect(() => membersOfSteps(story, [3])).toThrow(/nothing left to group/);
  });

  it('refuses to group by steps when some of their work objects sit in a group the steps only partly cover', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike' },
      ],
    });
    const bikes = story.elements().filter((element) => element.name === 'Bike');
    story.addGroup({ name: 'Pricing', members: ['Estimate', bikes[1]!.id] });
    expect(() => membersOfSteps(story, [1, 2])).toThrow(/"Estimate" in step 2 is in the group "Pricing", which also holds the work object "Bike"/);
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
    expect(() =>
      buildStory({
        title: 'T',
        sentences: [{ actor: 'A', activity: 'does', workObject: 'W' }],
        groups: [
          { name: 'One', steps: [1] },
          { name: 'Two', steps: [1] },
        ],
      }),
    ).toThrow(/Step 1 is already the group "One"; leave out one of the two groups/);
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
    // Naming the same element again would only wrap the group in a copy of itself.
    expect(() => story.addGroup({ name: 'Again', members: ['Estimate'] })).toThrow(/already the group "Pricing"/);
    // Naming the group itself wraps it on purpose.
    const around = story.addGroup({ name: 'Around', members: ['Pricing'] });
    expect(find('Pricing')['parent']).toBe(around.id);
  });

  it('moves members one by one out of a group that also holds something else', () => {
    const story = buildStory({
      title: 'T',
      sentences: [{ actor: 'Mechanic', activity: 'offers', workObject: 'Estimate', to: [{ activity: 'to', actor: 'Customer' }] }],
      groups: [{ name: 'Workshop', members: ['Mechanic', 'Estimate'] }],
    });
    const paperwork = story.addGroup({ name: 'Paperwork', members: ['Estimate'], x: 2000, y: 2000, width: 300, height: 200 });
    const find = (name: string) => story.elements().find((element) => element.name === name)!;
    expect(find('Estimate')['parent']).toBe(paperwork.id);
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

  it('keeps a named group whole in a box drawn with x and y, and moves a note with its element', () => {
    const story = Story.create({ title: 'T' });
    const estimate = story.addWorkObject({ name: 'Estimate', x: 100, y: 100 });
    const bike = story.addWorkObject({ name: 'Bike', x: 400, y: 100 });
    const mechanic = story.addActor({ name: 'Mechanic', x: 700, y: 100 });
    const pricing = story.addGroup({ name: 'Pricing', members: [estimate.id, bike.id] });
    const around = story.addGroup({ name: 'Around', members: [pricing.id, estimate.id], x: -500, y: -500, width: 5000, height: 5000 });
    expect([story.get(pricing.id)?.['parent'], story.get(estimate.id)?.['parent']]).toEqual([around.id, pricing.id]);
    const note = story.addAnnotation({ text: 'about Mechanic', attachTo: mechanic.id, x: 800, y: 100 }).annotation;
    const boss = story.addActor({ name: 'Boss', x: 950, y: 100 });
    const workshop = story.addGroup({ name: 'Workshop', members: [mechanic.id, note.id, boss.id], x: 650, y: 50, width: 400, height: 200 });
    const alone = story.addGroup({ name: 'Alone', members: [mechanic.id], x: 2000, y: 2000, width: 300, height: 200 });
    expect([story.get(mechanic.id)?.['parent'], story.get(note.id)?.['parent']]).toEqual([alone.id, alone.id]);
    expect(story.get(boss.id)?.['parent']).toBe(workshop.id);
  });

  it('draws a fitted box around the notes that move along, and lets an x/y box go inside the group it sits in', () => {
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
    const sub = story.addGroup({ name: 'Sub', members: [a.id], x: 2050, y: 50, width: 300, height: 200 });
    expect([story.get(sub.id)?.['parent'], story.get(a.id)?.['parent']]).toEqual([g.id, sub.id]);
  });

  it('refuses to grow a group past a billion pixels', () => {
    // The new box fits within the limit, but the group around it would have to grow past it.
    const story = Story.create({ title: 'T' });
    const a = story.addWorkObject({ name: 'A', x: -999_999_950, y: 0 });
    const b = story.addWorkObject({ name: 'B', x: -999_999_500, y: 0 });
    const third = story.addWorkObject({ name: 'C', x: -999_999_000, y: 0 });
    story.addGroup({ name: 'Edge', members: [a.id, b.id, third.id], x: -999_999_960, y: -100, width: 2000, height: 400 });
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

