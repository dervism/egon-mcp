import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import { toEgnJson } from '../egon/serialize.js';
import type { ShapeElement, StoryElement } from '../egon/types.js';
import { describeStory } from '../server/describe.js';
import type { StoryEntry } from '../server/workspace.js';
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

  it('refuses a member group that is not smaller than the box it should go into', () => {
    const story = Story.create({ title: 'T' });
    const big = story.addGroup({ name: 'Big', x: 0, y: 0, width: 800, height: 800 });
    expect(() => story.addGroup({ name: 'Small', members: [big.id], x: 1000, y: 0, width: 300, height: 200 })).toThrow(/not smaller than the new box/);
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
    const box = story.addGroup({ name: 'G', x: 0, y: 4000, width: 300, height: 300, members: [member.id] });
    expect(() => story.updateElement(box.id, { x: 5e8 })).toThrow(/billion/);
    expect(story.get(member.id)?.['x']).toBe(9e8);
    expect(story.get(box.id)?.['x']).toBe(0);
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
    expect([parentOf(story, 'Clerk'), parentOf(story, inner.id), parentOf(story, 'Form'), parentOf(story, 'monthly')]).toEqual([
      outer.id,
      outer.id,
      inner.id,
      outer.id,
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
    const other = story.addGroup({ name: 'Other', members: [story.addActor({ name: 'B', x: 600, y: 100 }).id], x: 50, y: 50, width: 900, height: 400 });
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
