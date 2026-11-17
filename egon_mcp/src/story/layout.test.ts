import { describe, expect, it } from 'vitest';
import { isActor, isWorkObject, type ActivityElement, type ShapeElement } from '../egon/types.js';
import { boundsOf, type Bounds } from './geometry.js';
import { toEgnJson } from '../egon/serialize.js';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import { autoLayout } from './layout.js';
import { buildStory } from './sentences.js';
import { Story } from './story.js';
import { validateStory } from './validate.js';

function stacked() {
  // Everything at the same spot, as an agent might create it.
  const story = Story.create({ title: 'Pizza' });
  for (const name of ['Customer', 'Clerk', 'Cook']) {
    story.addActor({ name, x: 0, y: 0 });
  }
  for (const name of ['Order', 'Pizza', 'Note']) {
    story.addWorkObject({ name, x: 0, y: 0 });
  }
  story.addActivity({ from: 'Customer', to: 'Order', label: 'tells' });
  story.addActivity({ from: 'Order', to: 'Clerk', label: 'to' });
  story.addActivity({ from: 'Clerk', to: 'Note', label: 'writes' });
  story.addActivity({ from: 'Note', to: 'Cook', label: 'for' });
  story.addActivity({ from: 'Cook', to: 'Pizza', label: 'bakes' });
  return story;
}

function shapes(story: Story): ShapeElement[] {
  return story.elements().filter((e) => isActor(e) || isWorkObject(e)) as ShapeElement[];
}

describe('autoLayout', () => {
  it('removes every overlap', () => {
    const story = stacked();
    expect(validateStory(story.toDocument()).some((i) => i.code === 'overlapping-shapes')).toBe(true);
    autoLayout(story);
    expect(validateStory(story.toDocument()).filter((i) => i.code === 'overlapping-shapes')).toEqual([]);
  });

  it('lays out the first sentence from left to right on one row', () => {
    const story = stacked();
    autoLayout(story);
    const byName = new Map(shapes(story).map((s) => [s.name, s]));
    const customer = byName.get('Customer')!;
    const order = byName.get('Order')!;
    const clerk = byName.get('Clerk')!;
    expect(customer.y).toBe(order.y);
    expect(order.y).toBe(clerk.y);
    expect(customer.x).toBeLessThan(order.x);
    expect(order.x).toBeLessThan(clerk.x);
  });

  it('keeps all shapes at non-negative coordinates', () => {
    const story = stacked();
    autoLayout(story);
    for (const shape of shapes(story)) {
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('reroutes activities to the new positions', () => {
    const story = stacked();
    autoLayout(story);
    const byId = new Map(story.elements().map((e) => [e.id, e]));
    for (const activity of story.elements().filter((e) => e.type === 'domainStory:activity') as ActivityElement[]) {
      const source = boundsOf(byId.get(activity.source) as ShapeElement);
      const start = activity.waypoints[0]!;
      expect(start.x).toBeGreaterThanOrEqual(source.x - 1);
      expect(start.x).toBeLessThanOrEqual(source.x + source.width + 1);
    }
  });

  it('places elements that take part in no activity after the others', () => {
    const story = stacked();
    story.addActor({ name: 'Bystander', x: 0, y: 0 });
    autoLayout(story);
    expect(validateStory(story.toDocument()).filter((i) => i.code === 'overlapping-shapes')).toEqual([]);
  });

  it('refits groups around their members and moves annotations next to their element', () => {
    const story = stacked();
    const group = story.addGroup({ name: 'Kitchen', members: ['Cook', 'Pizza'] });
    const { annotation } = story.addAnnotation({ text: 'hot', attachTo: 'Pizza' });
    autoLayout(story);
    const fitted = story.get(group.id) as ShapeElement & { width: number; height: number };
    for (const name of ['Cook', 'Pizza']) {
      const member = shapes(story).find((s) => s.name === name)!;
      expect(member.x).toBeGreaterThan(fitted.x);
      expect(member.x + 75).toBeLessThan(fitted.x + fitted.width);
      expect(member.y).toBeGreaterThan(fitted.y);
    }
    const pizza = shapes(story).find((s) => s.name === 'Pizza')!;
    const note = story.get(annotation.id) as ShapeElement;
    expect(Math.abs(note.x - pizza.x)).toBeLessThan(250);
    expect(Math.abs(note.y - pizza.y)).toBeLessThan(150);
  });

  it('keeps the members of each group together, so no group box encloses anything else', () => {
    const story = buildStory({
      title: 'Repair a bicycle',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'inspects', workObject: 'Bike' },
        { actor: 'Mechanic', activity: 'offers', workObject: 'Repair estimate', to: [{ activity: 'to', actor: 'Customer' }] },
        { actor: 'Customer', activity: 'gives', workObject: 'Approval', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'orders', workObject: 'Spare part', to: [{ activity: 'from', actor: 'Supplier' }] },
        { actor: 'Supplier', activity: 'delivers', workObject: 'Spare part', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike' },
        { actor: 'Mechanic', activity: 'passes on', workObject: 'Repair report', to: [{ activity: 'to', actor: 'Cashier' }] },
        { actor: 'Customer', activity: 'pays', workObject: 'Repair price', to: [{ activity: 'to', actor: 'Cashier' }] },
        { actor: 'Cashier', activity: 'hands over', workObject: 'Bike', to: [{ activity: 'to', actor: 'Customer' }] },
      ],
      groups: [
        { name: 'Repair', members: ['Repair estimate', 'Approval'] },
        { name: 'Purchasing', members: ['Spare part', 'Supplier'] },
        { name: 'Billing', members: ['Repair report', 'Repair price'] },
      ],
    });
    const groups = story.elements().filter((e) => e.type === 'domainStory:group') as (ShapeElement & { width: number; height: number })[];
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      for (const shape of shapes(story)) {
        const box = boundsOf(shape);
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const inside = center.x > group.x && center.x < group.x + group.width && center.y > group.y && center.y < group.y + group.height;
        expect(inside, `${shape.name} inside ${group.name}`).toBe(shape['parent'] === group.id);
      }
    }
    for (const [i, a] of groups.entries()) {
      for (const b of groups.slice(i + 1)) {
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart, `${a.name} and ${b.name} overlap`).toBe(true);
      }
    }
    expect(validateStory(story.toDocument())).toEqual([]);
  });

  it('keeps an Egon story\'s group around the shapes drawn inside it', () => {
    const story = Story.fromDocument(parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'story.egn'));
    expect(groupIssues(story)).toEqual([]);
    autoLayout(story);
    expect(groupIssues(story)).toEqual([]);
    const group = story.get('shape_1683') as ShapeElement & { width: number; height: number };
    for (const id of ['shape_0469', 'shape_2543', 'shape_8939']) {
      const shape = story.get(id) as ShapeElement;
      expect(shape.x > group.x && shape.x < group.x + group.width && shape.y > group.y && shape.y < group.y + group.height, id).toBe(true);
    }
  });

  it('lays out nested groups so each box holds exactly its own members, every time', () => {
    for (let run = 0; run < 25; run += 1) {
      const story = Story.create({ title: 'Nested' });
      const ids: Record<string, string> = {};
      for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        ids[name] = story.addActor({ name }).id;
      }
      const deepest = story.addGroup({ name: 'Deepest', members: [ids['G'] as string] });
      const inner = story.addGroup({ name: 'Inner', members: [ids['D'] as string, ids['E'] as string, ids['F'] as string, deepest.id] });
      story.addGroup({ name: 'Outer', members: [ids['A'] as string, ids['B'] as string, ids['C'] as string, inner.id] });
      autoLayout(story);
      expect(groupIssues(story), `run ${run}`).toEqual([]);
      expect(membersOutsideTheirBox(story), `run ${run}`).toEqual([]);
      const before = JSON.stringify(story.toDocument());
      autoLayout(story);
      expect(JSON.stringify(story.toDocument()), `run ${run}`).toBe(before);
    }
  });

  it('keeps an annotation inside the group it belongs to, in one run', () => {
    const story = buildStory({
      title: 'Letters',
      sentences: [
        { actor: 'Clerk', activity: 'fills', workObject: 'Form' },
        { actor: 'Clerk', activity: 'sends', workObject: 'Letter', to: [{ activity: 'to', actor: 'Customer' }] },
      ],
      annotations: [{ text: 'every month', attachTo: 'Letter' }],
    });
    story.addGroup({ name: 'Repeated', members: ['Letter', 'every month'] });
    autoLayout(story);
    expect(groupIssues(story)).toEqual([]);
    expect(membersOutsideTheirBox(story)).toEqual([]);
    const before = JSON.stringify(story.toDocument());
    autoLayout(story);
    expect(JSON.stringify(story.toDocument())).toBe(before);
  });

  it('moves a group without members out of the way', () => {
    const story = buildStory({ title: 'T', sentences: [{ actor: 'Clerk', activity: 'fills', workObject: 'Form' }] });
    story.addGroup({ name: 'To discuss' });
    autoLayout(story);
    expect(groupIssues(story)).toEqual([]);
  });
  it('puts a note on a group member into that group, so the saved file reopens the same', () => {
    const sentences = ['W0', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6'].map((workObject) => ({ actor: 'Clerk', activity: 'files', workObject }));
    const story = buildStory({ title: 'Notes', sentences, annotations: [{ text: 'only on Fridays', attachTo: 'W6' }] });
    const works = story.addGroup({ name: 'Works', members: ['W0', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6'] });
    autoLayout(story);
    expect(story.elements().find((element) => element['text'] === 'only on Fridays')?.['parent']).toBe(works.id);
    expect(groupIssues(story)).toEqual([]);
    expect(membersOutsideTheirBox(story)).toEqual([]);
    expectStableAfterReopening(story);
  });

  it('keeps the layout and the groups when the story is saved and opened again', () => {
    const story = buildStory({
      title: 'Workshop',
      sentences: [
        { actor: 'Customer', activity: 'brings', workObject: 'Bike', to: [{ activity: 'to', actor: 'Mechanic' }] },
        { actor: 'Mechanic', activity: 'writes', workObject: 'Repair slip' },
        { actor: 'Mechanic', activity: 'orders', workObject: 'Parts', to: [{ activity: 'from', actor: 'Supplier' }] },
        { actor: 'Mechanic', activity: 'repairs', workObject: 'Bike' },
      ],
      annotations: [
        { text: 'about 40 bikes a week', attachTo: 'Bike' },
        { text: 'paper slip on the bike', attachTo: 'Repair slip' },
      ],
    });
    const intake = story.addGroup({ name: 'Intake', members: ['Repair slip', 'paper slip on the bike'] });
    story.addGroup({ name: 'Workshop', members: [intake.id, 'Parts'] });
    story.addGroup({ name: 'To discuss', x: 3000, y: 3000, width: 300, height: 700 });
    autoLayout(story);
    expect(groupIssues(story)).toEqual([]);
    expectStableAfterReopening(story);
  });

  it('makes room for the height of an empty group nested in another group', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A' });
    const b = story.addActor({ name: 'B' });
    const empty = story.addGroup({ name: 'Big empty', x: 5000, y: 5000, width: 300, height: 700 });
    const other = story.addGroup({ name: 'Other', members: [b.id] });
    story.addGroup({ name: 'Outer', members: [a.id, empty.id, other.id] });
    autoLayout(story);
    expect(groupIssues(story)).toEqual([]);
    expect(membersOutsideTheirBox(story)).toEqual([]);
  });

  it('keeps wide notes in a group from overlapping', () => {
    const story = Story.create({ title: 'T' });
    const first = story.addAnnotation({ text: 'a note that is about forty-five characters', x: 0, y: 0 }).annotation;
    const second = story.addAnnotation({ text: 'another note of about forty-five characters', x: 0, y: 300 }).annotation;
    story.addGroup({ name: 'Notes', members: [first.id, second.id] });
    autoLayout(story);
    const [one, two] = [first.id, second.id].map((id) => boundsOf(story.get(id) as ShapeElement));
    expect(overlaps(one as Bounds, two as Bounds)).toBe(false);
  });

  it('gives the same layout whatever the order of the elements, which saving changes', () => {
    const story = stacked();
    for (const name of ['Legend actor', 'Legend system']) {
      story.addActor({ name, x: 0, y: 0 });
    }
    story.addWorkObject({ name: 'Legend document', x: 0, y: 0 });
    autoLayout(story);
    const positions = (of: Story) =>
      Object.fromEntries(of.elements().filter((element) => typeof element['x'] === 'number').map((element) => [element.id, [element['x'], element['y']]]));
    const doc = story.toDocument();
    const reversed = Story.fromDocument({ ...doc, elements: [...doc.elements].reverse() });
    autoLayout(reversed);
    expect(positions(reversed)).toEqual(positions(story));
  });

  it('changes nothing on a second run when parallel steps were placed by hand', () => {
    const story = Story.create({ title: 'T' });
    const at = (name: string, x: number, y: number, actor = true) => (actor ? story.addActor({ name, x, y }) : story.addWorkObject({ name, x, y })).id;
    const [a, w, b, w2, c, w3, d, w4] = [
      at('A', 0, 0),
      at('W', 200, 0, false),
      at('B', 400, 0),
      at('W2', 600, 0, false),
      at('C', 800, 0),
      at('W3', 1000, 0, false),
      at('D', 0, -500),
      at('W4', 200, -500, false),
    ] as string[];
    story.addActivity({ from: a as string, to: w as string, label: 'gives' });
    story.addActivity({ from: w as string, to: b as string, label: 'to' });
    story.addActivity({ from: b as string, to: w2 as string, label: 'gives' });
    story.addActivity({ from: w2 as string, to: c as string, label: 'to' });
    story.addActivity({ from: c as string, to: w3 as string, label: 'files' });
    story.addActivity({ from: d as string, to: w4 as string, label: 'signs', number: 3 });
    autoLayout(story);
    const before = JSON.stringify(story.toDocument());
    autoLayout(story);
    expect(JSON.stringify(story.toDocument())).toBe(before);
  });

  it('moves a note that belongs to no element out of group boxes', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 0, y: 0 });
    const w = story.addWorkObject({ name: 'W', x: 200, y: 0 });
    const b = story.addActor({ name: 'B', x: 0, y: 1000 });
    const w2 = story.addWorkObject({ name: 'W2', x: 200, y: 1000 });
    story.addActivity({ from: a.id, to: w.id, label: 'writes' });
    story.addActivity({ from: b.id, to: w2.id, label: 'reads' });
    story.addAnnotation({ text: 'a free note', x: 100, y: 330 });
    story.addGroup({ name: 'G', members: [b.id, w2.id] });
    autoLayout(story);
    expect(groupIssues(story)).toEqual([]);
    expect(story.elements().find((element) => element['text'] === 'a free note')?.['parent']).toBeUndefined();
    expectStableAfterReopening(story);
  });

  it('keeps a note on a group with that group', () => {
    const story = buildStory({ title: 'T', sentences: [{ actor: 'Clerk', activity: 'fills', workObject: 'Form' }, { actor: 'Boss', activity: 'signs', workObject: 'Form' }] });
    const group = story.addGroup({ name: 'Office', members: ['Boss'] });
    story.addAnnotation({ text: 'second floor', attachTo: group.id });
    autoLayout(story);
    expect(groupIssues(story)).toEqual([]);
    expect(membersOutsideTheirBox(story)).toEqual([]);
    expectStableAfterReopening(story);
  });

  it('keeps a note with the element it is attached to when it lands in another group\'s box', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'A', activity: 'writes', workObject: 'X' },
        { actor: 'B', activity: 'reads', workObject: 'Y' },
        { actor: 'C', activity: 'files', workObject: 'Z' },
        { actor: 'D', activity: 'signs', workObject: 'Q' },
      ],
      groups: [{ name: 'Writers', members: ['A', 'X'] }],
      annotations: [{ text: 'D only on Mondays', attachTo: 'D' }],
    });
    expect(story.elements().find((element) => element['text'] === 'D only on Mondays')?.['parent']).toBeUndefined();
    expect(groupIssues(story)).toEqual([]);
    expectStableAfterReopening(story);
  });

  it('keeps a note linked from two elements with its lowest-id link, whatever the element order', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Boss', activity: 'reads', workObject: 'R' },
        ...['W0', 'W1', 'W2'].map((workObject) => ({ actor: 'Clerk', activity: 'files', workObject })),
      ],
      annotations: [{ text: 'shared note', attachTo: 'R' }],
    });
    story.addGroup({ name: 'Works', members: ['W0', 'W1', 'W2'] });
    const note = story.elements().find((element) => element['text'] === 'shared note') as ShapeElement;
    const w2 = story.elements().find((element) => element.name === 'W2') as ShapeElement;
    const doc = story.toDocument();
    doc.elements.push({ type: 'domainStory:connection', id: 'connection_99999', name: '', source: w2.id, target: note.id, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    for (const elements of [doc.elements, [...doc.elements].reverse()]) {
      const opened = Story.fromDocument({ ...doc, elements });
      autoLayout(opened);
      expect(groupIssues(opened)).toEqual([]);
      expect(opened.get(note.id)?.['parent']).toBeUndefined();
      expectStableAfterReopening(opened);
    }
  });

  it('orders notes in a group by the element their chosen link comes from, whatever the element order', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Boss', activity: 'reads', workObject: 'R' },
        ...['W0', 'W1', 'W2'].map((workObject) => ({ actor: 'Clerk', activity: 'files', workObject })),
      ],
      annotations: [
        { text: 'on W1', attachTo: 'W1' },
        { text: 'on W2', attachTo: 'W2' },
      ],
    });
    story.addGroup({ name: 'Works', members: ['W0', 'W1', 'W2', 'on W1', 'on W2'] });
    const doc = story.toDocument();
    const r = doc.elements.find((element) => element.name === 'R') as ShapeElement;
    const onW2 = doc.elements.find((element) => element['text'] === 'on W2') as ShapeElement;
    doc.elements.push({ type: 'domainStory:connection', id: 'connection_99999', name: '', source: r.id, target: onW2.id, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const positions = (of: Story) => Object.fromEntries(of.elements().filter((e) => typeof e['x'] === 'number').map((e) => [e.id, [e['x'], e['y']]]));
    const forward = Story.fromDocument(doc);
    const reversed = Story.fromDocument({ ...doc, elements: [...doc.elements].reverse() });
    autoLayout(forward);
    autoLayout(reversed);
    expect(positions(reversed)).toEqual(positions(forward));
    expectStableAfterReopening(forward);
  });

  it('lays out shapes in no sentence left to right when their row was drawn a little crooked', () => {
    const story = Story.create({ title: 'T' });
    const ids = [
      story.addActor({ name: 'Left', x: 300, y: 102 }).id,
      story.addActor({ name: 'Middle', x: 500, y: 100 }).id,
      story.addActor({ name: 'Right', x: 700, y: 95 }).id,
    ];
    autoLayout(story);
    const xs = ids.map((id) => (story.get(id) as ShapeElement).x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('names the element that is too large to lay out within a billion pixels', () => {
    const story = Story.create({ title: 'T' });
    story.addGroup({ name: 'Tall', x: 0, y: 0, width: 300, height: 1e9 });
    story.addGroup({ name: 'Small', x: 5000, y: 0, width: 300, height: 300 });
    expect(() => autoLayout(story)).toThrow(/"Tall" is too large/);
  });

  it('lays out a file whose groups named each other as parent', () => {
    const text = JSON.stringify({
      domain: { name: 'default', actors: {}, workObjects: {} },
      dst: [
        { type: 'domainStory:group', id: 'outer', name: 'Outer', x: 0, y: 0, width: 1000, height: 1000, parent: 'inner' },
        { type: 'domainStory:group', id: 'inner', name: 'Inner', x: 100, y: 100, width: 300, height: 300 },
        { type: 'domainStory:actorPerson', id: 'a', name: 'A', x: 150, y: 150 },
        { type: 'domainStory:workObjectDocument', id: 'w', name: 'W', x: 600, y: 600 },
        { info: '' },
        { version: '3.2.1' },
      ],
    });
    const story = Story.fromDocument(parseStoryFile(text, 'story.egn'));
    autoLayout(story);
    expect(groupIssues(story)).toEqual([]);
    expect(membersOutsideTheirBox(story)).toEqual([]);
    const before = JSON.stringify(story.toDocument());
    autoLayout(story);
    expect(JSON.stringify(story.toDocument())).toBe(before);
  });
});

/** Members, nested groups included, whose bounds stick out of their group's box. */
function membersOutsideTheirBox(story: Story): string[] {
  const elements = story.elements();
  const byId = new Map(elements.map((element) => [element.id, element]));
  return elements
    .filter((element) => typeof element['parent'] === 'string' && byId.get(element['parent'] as string)?.type === 'domainStory:group')
    .filter((element) => !contains(boundsOf(byId.get(element['parent'] as string) as ShapeElement), boundsOf(element as ShapeElement)))
    .map((element) => element.id);
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Saving and opening the story changes no group, and auto_layout then changes nothing. */
function expectStableAfterReopening(story: Story): void {
  const reopened = Story.fromDocument(parseStoryFile(toEgnJson(story.toDocument()), 'story.egn'));
  const parents = (of: Story) => Object.fromEntries(of.elements().map((element) => [element.id, element['parent']]));
  expect(parents(reopened)).toEqual(parents(story));
  const before = JSON.stringify(reopened.toDocument().elements);
  autoLayout(reopened);
  expect(JSON.stringify(reopened.toDocument().elements)).toBe(before);
}

function groupIssues(story: Story): string[] {
  return validateStory(story.toDocument())
    .filter((issue) => issue.code === 'group-encloses-non-member' || issue.code === 'overlapping-groups')
    .map((issue) => issue.message);
}
