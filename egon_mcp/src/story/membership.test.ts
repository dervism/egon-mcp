import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import { toEgnJson } from '../egon/serialize.js';
import type { ShapeElement, StoryElement } from '../egon/types.js';
import { describeStory } from '../server/describe.js';
import type { StoryEntry } from '../server/workspace.js';
import { membersFor } from './membership.js';
import { addSentence, buildStory } from './sentences.js';
import { Story } from './story.js';
import { validateStory } from './validate.js';

/** A story from an Egon 3 file with these elements. */
function opened(elements: object[]): Story {
  const text = JSON.stringify({ domain: { name: 'default', actors: {}, workObjects: {} }, dst: [...elements, { info: '' }, { version: '3.2.1' }] });
  return Story.fromDocument(parseStoryFile(text, 'story.egn'));
}

/** The same story after save_story and open_story. */
function reopened(story: Story): Story {
  return Story.fromDocument(parseStoryFile(toEgnJson(story.toDocument()), 'story.egn'));
}

function parents(story: Story): Record<string, unknown> {
  return Object.fromEntries(story.elements().map((element: StoryElement) => [element.id, element['parent']]));
}

/** An element by id, name or annotation text. */
const find = (story: Story, ref: string) => story.elements().find((element) => element.id === ref || element.name === ref || element['text'] === ref);
const parentOf = (story: Story, ref: string) => find(story, ref)?.['parent'];
const group = (id: string, x: number, y: number, width?: number, height?: number, parent?: string) => ({
  type: 'domainStory:group',
  id,
  name: id,
  x,
  y,
  ...(width !== undefined ? { width, height } : {}),
  ...(parent ? { parent } : {}),
});
const actor = (id: string, x: number, y: number, parent?: string) => ({ type: 'domainStory:actorPerson', id, name: id, x, y, ...(parent ? { parent } : {}) });
const note = (id: string, x: number, y: number) => ({ type: 'domainStory:textAnnotation', id, text: id, x, y, width: 100, height: 30 });

describe('group membership in an opened file', () => {
  it('puts shapes without parent into the group that holds their top-left corner, as Egon does', () => {
    // Egon reads parent, but leaves it out for shapes that a group was drawn around.
    const story = Story.fromDocument(parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'story.egn'));
    for (const id of ['shape_0469', 'shape_2543', 'shape_8939']) {
      expect(parentOf(story, id), id).toBe('shape_1683');
    }
    for (const id of ['shape_0798', 'shape_5496', 'shape_5871', 'shape_1683']) {
      expect(parentOf(story, id), id).toBeUndefined();
    }
  });

  it('keeps an explicit parent and puts a group inside the smallest larger group around it', () => {
    const story = opened([
      group('outer', 0, 0, 1000, 1000),
      group('inner', 100, 100, 300, 300),
      actor('a', 150, 150),
      actor('b', 600, 600),
      actor('c', 150, 150, 'outer'),
    ]);
    expect(['inner', 'a', 'b', 'c', 'outer'].map((id) => parentOf(story, id))).toEqual(['outer', 'inner', 'outer', 'outer', undefined]);
  });

  it('counts the edges of the box as inside, like Egon', () => {
    const story = opened([group('g', 0, 0, 300, 200), actor('corner', 300, 200), actor('outside', 301, 200)]);
    expect([parentOf(story, 'corner'), parentOf(story, 'outside')]).toEqual(['g', undefined]);
  });

  it('nests neither of two groups with the same box', () => {
    const story = opened([group('one', 0, 0, 300, 200), group('two', 0, 0, 300, 200)]);
    expect([parentOf(story, 'one'), parentOf(story, 'two')]).toEqual([undefined, undefined]);
  });

  it('puts annotations into the group around them', () => {
    const story = opened([group('g', 0, 0, 300, 200), note('n', 20, 20)]);
    expect(parentOf(story, 'n')).toBe('g');
  });

  it('uses the default group size for a group without width and height', () => {
    const story = opened([group('g', 0, 0), actor('a', 50, 50)]);
    expect(parentOf(story, 'a')).toBe('g');
    expect(validateStory(story.toDocument()).map((issue) => issue.code)).not.toContain('group-encloses-non-member');
  });

  it('treats a parent that names no group as missing, as Egon does', () => {
    const story = opened([group('g', 0, 0, 300, 200), actor('a', 50, 50, 'shape_gone')]);
    expect(parentOf(story, 'a')).toBe('g');
  });

  it('breaks parent loops: a group that names itself, and two groups that name each other', () => {
    // Drawing A inside B and then resizing A around B leaves A.parent = B in Egon.
    const story = opened([group('self', 2000, 0, 300, 300, 'self'), group('outer', 0, 0, 1000, 1000, 'inner'), group('inner', 100, 100, 300, 300)]);
    expect(['self', 'outer', 'inner'].map((id) => parentOf(story, id))).toEqual([undefined, undefined, 'outer']);
  });
});

describe('group membership while editing', () => {
  it('lets a box drawn with coordinates take in the shapes whose top-left corner lies in it', () => {
    const story = buildStory({ title: 'T', sentences: [{ actor: 'Clerk', activity: 'fills', workObject: 'Form' }] });
    const clerk = find(story, 'Clerk') as ShapeElement;
    const box = story.addGroup({ name: 'Office', x: clerk.x - 20, y: clerk.y - 20, width: 800, height: 200 });
    expect([parentOf(story, 'Clerk'), parentOf(story, 'Form')]).toEqual([box.id, box.id]);
    expect(validateStory(story.toDocument()).filter((issue) => issue.code.includes('group'))).toEqual([]);
    expect(parents(reopened(story))).toEqual(parents(story));
  });

  it('nests a group drawn inside another group', () => {
    const story = Story.create({ title: 'T' });
    const outer = story.addGroup({ name: 'Outer', x: 0, y: 0, width: 1000, height: 1000 });
    const inner = story.addGroup({ name: 'Inner', x: 100, y: 100, width: 300, height: 300 });
    expect(story.get(inner.id)?.['parent']).toBe(outer.id);
    expect(parents(reopened(story))).toEqual(parents(story));
  });

  it('gives a box fitted around members only those members', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 100, y: 100 });
    story.addWorkObject({ name: 'W', x: 150, y: 150 });
    const box = story.addGroup({ name: 'G', members: [a.id] });
    expect([parentOf(story, 'A'), parentOf(story, 'W')]).toEqual([box.id, undefined]);
    expect(validateStory(story.toDocument()).map((issue) => issue.code)).toContain('group-encloses-non-member');
    // A file cannot say "not in the group", so the covered shape joins it when the file is opened again.
    expect(parentOf(reopened(story), 'W')).toBe(box.id);
  });

  it('nests a box fitted around members only in a group that holds all of them, wherever its corner lands', () => {
    const story = Story.create({ title: 'T' });
    // Shapes spread over two rows, as before a layout: the first box covers the corner of the second.
    const a = story.addWorkObject({ name: 'A', x: 0, y: 0 });
    const b = story.addWorkObject({ name: 'B', x: 650, y: 350 });
    const c = story.addWorkObject({ name: 'C', x: 100, y: 100 });
    const d = story.addWorkObject({ name: 'D', x: 700, y: 400 });
    const first = story.addGroup({ name: 'First', members: [a.id, b.id] });
    const second = story.addGroup({ name: 'Second', members: [c.id, d.id] });
    expect(parentOf(story, second.id)).toBeUndefined();
    const inner = story.addGroup({ name: 'Inner', members: [a.id] });
    expect(parentOf(story, inner.id)).toBe(first.id);
  });

  it('wants both x and y for a box, or neither', () => {
    const story = Story.create({ title: 'T' });
    expect(() => story.addGroup({ name: 'G', x: 100 })).toThrow(/both x and y/);
  });

  it('takes a nested group out of a group that shrinks below its size', () => {
    const story = Story.create({ title: 'T' });
    const outer = story.addGroup({ name: 'Outer', x: 0, y: 0, width: 1000, height: 1000 });
    const inner = story.addGroup({ name: 'Inner', x: 100, y: 100, width: 300, height: 300 });
    expect(parentOf(story, inner.id)).toBe(outer.id);
    story.updateElement(outer.id, { width: 200, height: 200 });
    expect(parentOf(story, inner.id)).toBeUndefined();
    expect(parents(reopened(story))).toEqual(parents(story));
  });

  it('gives an attached note the group of its element, wherever it lands', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 500, y: 300 });
    story.addGroup({ name: 'Above', x: 400, y: 0, width: 600, height: 280 });
    const { annotation } = story.addAnnotation({ text: 'about A', attachTo: a.id });
    expect(parentOf(story, annotation.id)).toBeUndefined();
  });

  it('gives a note attached without a position the group of its element, or the group it describes', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 100, y: 100 });
    const box = story.addGroup({ name: 'G', members: [a.id] });
    expect(parentOf(story, story.addAnnotation({ text: 'about A', attachTo: a.id }).annotation.id)).toBe(box.id);
    expect(parentOf(story, story.addAnnotation({ text: 'about G', attachTo: box.id }).annotation.id)).toBe(box.id);
  });

  it('places a shape without a position quickly below a very tall group', () => {
    const story = Story.create({ title: 'T' });
    story.addGroup({ name: 'Everything', x: 0, y: 0, width: 2000, height: 1e8 });
    const started = Date.now();
    const actor = story.addActor({ name: 'A' });
    expect(Date.now() - started).toBeLessThan(500);
    expect(actor.y).toBeGreaterThan(1e8);
  });

  it('never places anything beyond a billion pixels, so every saved file opens again', () => {
    const story = Story.create({ title: 'T' });
    story.addGroup({ name: 'Everything', x: 0, y: 0, width: 2000, height: 1e9 });
    expect(() => story.addActor({ name: 'A' })).toThrow(/give x and y/i);
    const far = story.addActor({ name: 'Far', x: -1e9, y: 0 });
    expect(() => story.addGroup({ name: 'Fitted', members: [far.id] })).toThrow(/billion/);
    expect(() => story.addAnnotation({ text: 'note', attachTo: story.addActor({ name: 'Edge', x: 1e9 - 10, y: 5000 }).id })).toThrow(/billion/);
    const member = story.addActor({ name: 'Member', x: 9e8, y: 5000 });
    const box = story.addGroup({ name: 'G', members: [member.id] });
    expect(() => story.updateElement(box.id, { x: 1e9 - 10 })).toThrow(/billion/);
    expect(story.get(member.id)?.['x']).toBe(9e8);
    expect(story.get(box.id)?.['x']).toBe(9e8 - 40);
  });

  it('puts a shape added inside a group box into that group, as dropping it there in Egon does', () => {
    const story = Story.create({ title: 'T' });
    const box = story.addGroup({ name: 'G', x: 0, y: 0, width: 300, height: 200 });
    story.addActor({ name: 'A', x: 50, y: 50 });
    story.addWorkObject({ name: 'W', x: 150, y: 50 });
    story.addAnnotation({ text: 'note', x: 200, y: 150 });
    expect([parentOf(story, 'A'), parentOf(story, 'W'), parentOf(story, 'note')]).toEqual([box.id, box.id, box.id]);
    expect(parents(reopened(story))).toEqual(parents(story));
  });

  it('places shapes without a position outside every group box', () => {
    const story = Story.create({ title: 'T' });
    story.addGroup({ name: 'G', x: 0, y: 0, width: 700, height: 500 });
    addSentence(story, { actor: 'Clerk', activity: 'fills', workObject: 'Form' });
    expect([parentOf(story, 'Clerk'), parentOf(story, 'Form')]).toEqual([undefined, undefined]);
    expect(validateStory(story.toDocument()).filter((issue) => issue.code.includes('group'))).toEqual([]);
  });

  it('moves a shape into a group and out again with updateElement', () => {
    const story = Story.create({ title: 'T' });
    const box = story.addGroup({ name: 'G', x: 0, y: 0, width: 300, height: 200 });
    story.addActor({ name: 'A', x: 600, y: 600 });
    story.updateElement('A', { x: 50, y: 50 });
    expect(parentOf(story, 'A')).toBe(box.id);
    story.updateElement('A', { x: 600 });
    expect(parentOf(story, 'A')).toBeUndefined();
  });

  it('moves the members of a group, nested groups and annotations included, along with it', () => {
    const story = buildStory({
      title: 'T',
      sentences: [{ actor: 'Clerk', activity: 'fills', workObject: 'Form' }],
      annotations: [{ text: 'monthly', attachTo: 'Form' }],
    });
    const inner = story.addGroup({ name: 'Inner', members: ['Form'] });
    const outer = story.addGroup({ name: 'Outer', members: ['Clerk', inner.id, 'monthly'] });
    const before = story.elements() as ShapeElement[];
    story.updateElement(outer.id, { x: outer.x + 500, y: outer.y + 300 });
    for (const element of before.filter((element) => typeof element.x === 'number')) {
      const after = story.get(element.id) as ShapeElement;
      expect([after.x - element.x, after.y - element.y], element.id).toEqual([500, 300]);
    }
    // The note on Form went into Inner together with Form.
    expect([parentOf(story, 'Clerk'), parentOf(story, inner.id), parentOf(story, 'Form'), parentOf(story, 'monthly')]).toEqual([
      outer.id,
      outer.id,
      inner.id,
      inner.id,
    ]);
    expect(validateStory(story.toDocument()).filter((issue) => issue.code.includes('group'))).toEqual([]);
  });

  it('takes in the shapes a resized group now covers', () => {
    const story = Story.create({ title: 'T' });
    const box = story.addGroup({ name: 'G', x: 0, y: 0, width: 300, height: 200 });
    story.addActor({ name: 'A', x: 500, y: 50 });
    story.updateElement(box.id, { width: 700 });
    expect(parentOf(story, 'A')).toBe(box.id);
  });

  it('hands the members of a removed group to the group whose box holds them', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 150, y: 150 });
    const fitted = story.addGroup({ name: 'Fitted', members: [a.id] });
    story.addActor({ name: 'B', x: 600, y: 100 });
    const other = story.addGroup({ name: 'Other', x: 50, y: 50, width: 900, height: 400 });
    expect(parentOf(story, 'A')).toBe(fitted.id);
    story.removeElement(fitted.id);
    expect(parentOf(story, 'A')).toBe(other.id);
    expect(parents(reopened(story))).toEqual(parents(story));
  });

  it('hands the members of a removed group to the group around it', () => {
    const story = Story.create({ title: 'T' });
    const outer = story.addGroup({ name: 'Outer', x: 0, y: 0, width: 1000, height: 1000 });
    const inner = story.addGroup({ name: 'Inner', x: 100, y: 100, width: 300, height: 300 });
    story.addActor({ name: 'A', x: 150, y: 150 });
    expect(parentOf(story, 'A')).toBe(inner.id);
    story.removeElement(inner.id);
    expect(parentOf(story, 'A')).toBe(outer.id);
  });
});

describe('group checks', () => {
  it('warns about a non-member whose top-left corner lies in a box, annotations included', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 100, y: 100 });
    story.addAnnotation({ text: 'stray', x: 110, y: 120 });
    story.addActor({ name: 'Edge', x: a.x - 60, y: a.y });
    story.addGroup({ name: 'G', members: [a.id] });
    const flagged = validateStory(story.toDocument())
      .filter((issue) => issue.code === 'group-encloses-non-member')
      .map((issue) => issue.message);
    expect(flagged.some((message) => message.includes('stray'))).toBe(true);
    // Edge's top-left corner lies left of the box, so Egon would not count it as inside.
    expect(flagged.some((message) => message.includes('"Edge"'))).toBe(false);
  });

  it('names the element a note is attached to by the link of lowest id, as auto_layout does', () => {
    const story = Story.create({ title: 'T' });
    const alice = story.addActor({ name: 'Alice', x: 0, y: 0 });
    const bob = story.addActor({ name: 'Bob', x: 500, y: 0 });
    const note = story.addAnnotation({ text: 'shared', x: 300, y: 300 }).annotation;
    const doc = story.toDocument();
    // Egon sorts ids as text, so connection_10005 comes before connection_9999 in its files.
    doc.elements.push(
      { type: 'domainStory:connection', id: 'connection_10005', name: '', source: alice.id, target: note.id, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { type: 'domainStory:connection', id: 'connection_9999', name: '', source: bob.id, target: note.id, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    );
    const view = describeStory({ story: Story.fromDocument(doc) } as unknown as StoryEntry);
    expect(view.annotations[0]?.attachedTo).toBe('Bob');
    expect(view.annotations[0]?.attachedToId).toBe(bob.id);
  });

  it('lists annotation members of a group by their text', () => {
    const story = Story.create({ title: 'T' });
    const annotation = story.addAnnotation({ text: 'every month', x: 0, y: 0 }).annotation;
    story.addGroup({ name: 'G', members: [annotation.id] });
    const view = describeStory({ story } as unknown as StoryEntry);
    expect(view.groups[0]?.members).toEqual(['every month']);
  });
});

describe('what goes into a new group', () => {
  const doc = (elements: object[]) => opened(elements).elements();
  const workObject = (id: string, x: number, y: number, parent?: string) => ({ type: 'domainStory:workObjectDocument', id, name: id.toUpperCase(), x, y, ...(parent ? { parent } : {}) });

  it('nests the new group in the innermost group that holds every member, and takes the groups inside it whole', () => {
    const elements = doc([
      group('outer', 0, 0, 2000, 2000),
      group('middle', 50, 50, 1500, 1500, 'outer'),
      group('inner', 100, 100, 500, 500, 'middle'),
      workObject('a', 150, 150, 'inner'),
      workObject('b', 900, 900, 'middle'),
    ]);
    expect(membersFor(['a', 'b'], elements)).toEqual({ host: 'middle', members: ['inner', 'b'] });
    expect(membersFor(['a'], elements)).toEqual({ host: 'inner', members: ['a'] });
  });

  it('moves members out of a group that holds something else, and takes in a group whose actors and work objects are all named', () => {
    const elements = doc([
      group('workshop', 0, 0, 1000, 1000),
      actor('mechanic', 100, 100, 'workshop'),
      workObject('estimate', 300, 100, 'workshop'),
      group('customers', 2000, 0, 300, 300),
      actor('customer', 2100, 100, 'customers'),
    ]);
    expect(membersFor(['customer', 'estimate'], elements)).toEqual({ host: undefined, members: ['customers', 'estimate'] });
  });

  it('leaves notes out when it decides whether a group goes in whole', () => {
    const elements = doc([
      group('intake', 0, 0, 1000, 1000),
      workObject('a', 100, 100, 'intake'),
      { type: 'domainStory:textAnnotation', id: 'n', text: 'about intake', x: 300, y: 100, width: 100, height: 30, parent: 'intake' },
      { type: 'domainStory:connection', id: 'c', source: 'intake', target: 'n', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      group('notes only', 2000, 0, 300, 300),
      { type: 'domainStory:textAnnotation', id: 'm', text: 'loose', x: 2100, y: 100, width: 100, height: 30, parent: 'notes only' },
      workObject('x', 3000, 0),
    ]);
    expect(membersFor(['a', 'x'], elements)).toEqual({ host: undefined, members: ['intake', 'x'] });
    expect(membersFor(['m', 'x'], elements)).toEqual({ host: undefined, members: ['m', 'x'] });
  });

  it('takes a named group with everything in it, and what lies inside it along with it', () => {
    const elements = doc([group('g2', 0, 0, 2000, 2000), group('g1', 100, 100, 500, 500, 'g2'), workObject('a', 150, 150, 'g1'), actor('b', 300, 300, 'g1')]);
    expect(membersFor(['g1'], elements)).toEqual({ host: 'g2', members: ['g1'] });
    expect(membersFor(['g1', 'a'], elements)).toEqual({ host: 'g2', members: ['g1'] });
  });
});
