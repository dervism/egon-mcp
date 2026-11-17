import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import { toEgnJson } from '../egon/serialize.js';
import { EGON_FORMAT_VERSION, type ActivityElement } from '../egon/types.js';
import { Story, StoryError } from './story.js';

function pizzaStory() {
  const story = Story.create({ title: 'Order pizza', description: 'A customer orders a pizza.' });
  const customer = story.addActor({ name: 'Customer' });
  const order = story.addWorkObject({ name: 'Order', icon: 'Document' });
  const clerk = story.addActor({ name: 'Clerk', icon: 'Person' });
  return { story, customer, order, clerk };
}

describe('Story.create', () => {
  it('starts an empty story with Egon defaults', () => {
    const doc = Story.create({ title: 'T' }).toDocument();
    expect(doc).toMatchObject({ title: 'T', description: '', version: EGON_FORMAT_VERSION, elements: [] });
    expect(Object.keys(doc.iconSet.actors)).toEqual(['Person', 'Group', 'System']);
  });
});

describe('element ids', () => {
  it('count up from the highest id in the story, so the file keeps the order elements were added in', () => {
    const story = Story.fromDocument(
      parseStoryFile(
        JSON.stringify({
          domain: { name: 'default', actors: {}, workObjects: {} },
          dst: [
            { type: 'domainStory:actorPerson', id: 'shape_9999', name: 'A', x: 0, y: 0 },
            { type: 'domainStory:workObjectDocument', id: 'shape_0042', name: 'W', x: 200, y: 0 },
            { type: 'domainStory:activity', id: 'connection_0500', name: 'writes', source: 'shape_9999', target: 'shape_0042', number: 1, waypoints: [{ x: 75, y: 37 }, { x: 200, y: 37 }] },
            { info: '' },
            { version: '3.2.1' },
          ],
        }),
        'story.egn',
      ),
    );
    const suffix = (id: string) => Number(id.replace(/^\D+_/, ''));
    const first = story.addActor({ name: 'B' });
    const second = story.addWorkObject({ name: 'V' });
    const activity = story.addActivity({ from: first.id, to: second.id, label: 'reads' });
    expect(first.id).toMatch(/^shape_\d+$/);
    expect(suffix(first.id)).toBeGreaterThan(9999);
    expect(suffix(second.id)).toBeGreaterThan(suffix(first.id));
    expect(activity.id).toMatch(/^connection_\d+$/);
    expect(suffix(activity.id)).toBeGreaterThan(500);
  });
});

describe('element ids, continued', () => {
  const fileWith = (elements: object[]) =>
    Story.fromDocument(parseStoryFile(JSON.stringify({ domain: { name: 'default', actors: {}, workObjects: {} }, dst: [...elements, { info: '' }, { version: '3.2.1' }] }), 'story.egn'));

  it('start at 10000, above the four-digit ids Egon draws at random', () => {
    const story = fileWith([{ type: 'domainStory:actorPerson', id: 'shape_0042', name: 'A', x: 0, y: 0 }]);
    expect(story.addActor({ name: 'B' }).id).toBe('shape_10000');
    expect(Story.create({ title: 'T' }).addActor({ name: 'A' }).id).toBe('shape_10000');
  });

  it('never repeat an id that is already in the story, even at sixteen digits', () => {
    const story = fileWith([
      { type: 'domainStory:actorPerson', id: 'shape_999999999999998', name: 'A', x: 0, y: 0 },
      { type: 'domainStory:actorPerson', id: 'shape_1000000000000000', name: 'B', x: 300, y: 0 },
    ]);
    const ids = [story.addActor({ name: 'C' }).id, story.addActor({ name: 'D' }).id, story.addActor({ name: 'E' }).id];
    expect(new Set([...ids, 'shape_999999999999998', 'shape_1000000000000000']).size).toBe(5);
    expect(story.elements().filter((element) => element.name === 'B')).toHaveLength(1);
  });

  it('are not used up by a refused edit', () => {
    const story = Story.create({ title: 'T' });
    // The color is checked after the id is drawn.
    expect(() => story.addActor({ name: 'A', color: 'not a color!' })).toThrow();
    expect(story.addActor({ name: 'B' }).id).toBe('shape_10000');
  });

  it('skip ids that dangling arrows still name', () => {
    const story = fileWith([
      { type: 'domainStory:actorPerson', id: 'shape_1', name: 'A', x: 0, y: 0 },
      { type: 'domainStory:activity', id: 'connection_1', name: 'writes', source: 'shape_1', target: 'shape_10000', number: 1, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { type: 'domainStory:actorPerson', id: 'shape_2', name: 'B', x: 500, y: 0, parent: 'shape_10001' },
    ]);
    const added = [story.addWorkObject({ name: 'Unrelated' }).id, story.addWorkObject({ name: 'Other' }).id];
    expect(added).not.toContain('shape_10000');
    // Opening the file dropped the parent that names no group, so its id is free again.
    expect(story.get('shape_2')?.['parent']).toBeUndefined();
  });

  it('never hand out an id again after its element was removed', () => {
    const story = Story.create({ title: 'T' });
    const first = story.addActor({ name: 'A' });
    story.removeElement(first.id);
    expect(story.addActor({ name: 'B' }).id).not.toBe(first.id);
  });

  it('stay short and unique next to very long ids, so the saved file opens again', () => {
    const long = `shape_${'9'.repeat(250)}`;
    const story = fileWith([{ type: 'domainStory:actorPerson', id: long, name: 'A', x: 0, y: 0 }]);
    const ids = [story.addActor({ name: 'B' }).id, story.addActor({ name: 'C' }).id];
    expect(ids).toEqual(['shape_10000', 'shape_10001']);
    const reopened = Story.fromDocument(parseStoryFile(toEgnJson(story.toDocument()), 'story.egn'));
    expect(reopened.elements().map((element) => element.id).sort()).toEqual([...ids, long].sort());
  });
});

describe('positions', () => {
  it('leave an element untouched when an update is refused', () => {
    const story = Story.create({ title: 'T' });
    const actor = story.addActor({ name: 'A', x: 100, y: 100 });
    expect(() => story.updateElement(actor.id, { name: 'Renamed', x: 5e9 })).toThrow(/billion/);
    expect(() => story.updateElement(actor.id, { x: 500, y: 5e9 })).toThrow(/billion/);
    expect(story.get(actor.id)).toMatchObject({ name: 'A', x: 100, y: 100 });
  });

  it('want both x and y, or neither', () => {
    const story = Story.create({ title: 'T' });
    expect(() => story.addActor({ name: 'A', x: 100 })).toThrow(/both x and y/);
    expect(() => story.addWorkObject({ name: 'W', y: 100 })).toThrow(/both x and y/);
    expect(() => story.addAnnotation({ text: 'n', x: 100 })).toThrow(/both x and y/);
  });

  it('refuse coordinates and sizes beyond a billion pixels', () => {
    const story = Story.create({ title: 'T' });
    expect(() => story.addActor({ name: 'A', x: 2e9, y: 0 })).toThrow(/billion/);
    expect(() => story.addGroup({ name: 'G', x: 0, y: 0, width: 300, height: 1e20 })).toThrow(/billion/);
    const actor = story.addActor({ name: 'B' });
    expect(() => story.updateElement(actor.id, { y: -3e9 })).toThrow(/billion/);
  });

  it('places a shape next to a group that covers only the first column', () => {
    const story = Story.create({ title: 'T' });
    story.addGroup({ name: 'Narrow', x: 0, y: 0, width: 150, height: 5000 });
    const actor = story.addActor({ name: 'A' });
    expect(actor.y).toBeLessThan(300);
    expect(actor.x).toBeGreaterThan(150);
  });

  it('draws a group without members or position below the story, where it takes in nothing', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A' });
    const group = story.addGroup({ name: 'To discuss' });
    expect(story.get(a.id)?.['parent']).toBeUndefined();
    expect(group.y).toBeGreaterThan(a.y + 75);
  });
});

describe('adding actors and work objects', () => {
  it('creates elements with Egon types, unique shape ids and default sizes', () => {
    const { story, customer, order } = pizzaStory();
    expect(customer.type).toBe('domainStory:actorPerson');
    expect(order.type).toBe('domainStory:workObjectDocument');
    expect(customer.id).toMatch(/^shape_\d{4,}$/);
    expect(customer.id).not.toBe(order.id);
    expect(story.toDocument().elements).toHaveLength(3);
  });

  it('places new shapes without overlapping existing ones', () => {
    const { customer, order, clerk } = pizzaStory();
    const xs = [customer.x, order.x, clerk.x];
    expect(new Set(xs.map((x, i) => `${x},${[customer.y, order.y, clerk.y][i]}`)).size).toBe(3);
  });

  it('uses given coordinates', () => {
    const story = Story.create({ title: 'T' });
    expect(story.addActor({ name: 'A', x: 500, y: 40 })).toMatchObject({ x: 500, y: 40 });
  });

  it('accepts any built-in icon case-insensitively and adds it to the icon set', () => {
    const story = Story.create({ title: 'T' });
    const car = story.addWorkObject({ name: 'Car', icon: 'car' });
    expect(car.type).toBe('domainStory:workObjectCar');
    expect(story.toDocument().iconSet.workObjects['Car']).toMatch(/^<svg/);
  });

  it('rejects unknown icons and suggests close matches', () => {
    const story = Story.create({ title: 'T' });
    expect(() => story.addActor({ name: 'A', icon: 'Pizzaiolo' })).toThrow(StoryError);
    expect(() => story.addWorkObject({ name: 'Bill', icon: 'credit' })).toThrow(/Credit-Card/);
  });

  it('allows custom icons registered with an SVG', () => {
    const story = Story.create({ title: 'T' });
    story.addCustomIcon({ kind: 'workObject', name: 'Pizza', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>' });
    expect(story.addWorkObject({ name: 'Margherita', icon: 'Pizza' }).type).toBe('domainStory:workObjectPizza');
    // Egon only treats data URLs as custom icons (util.js, icon-css.service.ts).
    const dataUrl = story.toDocument().iconSet.workObjects['Pizza'] as string;
    expect(dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    // Browsers only draw SVG images whose root declares the SVG namespace.
    expect(Buffer.from(dataUrl.split(',')[1] as string, 'base64').toString()).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it('stores a picked color', () => {
    const story = Story.create({ title: 'T' });
    expect(story.addActor({ name: 'A', color: '#E53935' }).pickedColor).toBe('#E53935');
    expect(() => story.addActor({ name: 'B', color: 'red; stroke: x' })).toThrow(/color/);
    expect(() => story.addActor({ name: 'C', color: 'rgb(1, 2, 3)' })).toThrow(/color/);
    expect(story.addActor({ name: 'D', color: 'black' }).pickedColor).toBe('black');
  });
});

describe('activities', () => {
  it('numbers activities that start at an actor', () => {
    const { story, customer, order, clerk } = pizzaStory();
    const first = story.addActivity({ from: customer.id, to: order.id, label: 'places' });
    const second = story.addActivity({ from: clerk.id, to: order.id, label: 'confirms' });
    expect(first).toMatchObject({ type: 'domainStory:activity', name: 'places', number: 1, source: customer.id, target: order.id });
    expect(first.id).toMatch(/^connection_\d{4,}$/);
    expect(second.number).toBe(2);
  });

  it('leaves activities from a work object to an actor unnumbered', () => {
    const { story, customer, order, clerk } = pizzaStory();
    story.addActivity({ from: customer.id, to: order.id, label: 'places' });
    const handOver = story.addActivity({ from: order.id, to: clerk.id, label: 'with' });
    expect(handOver.number ?? null).toBeNull();
  });

  it('resolves elements by name, case-insensitively', () => {
    const { story, customer, order } = pizzaStory();
    const activity = story.addActivity({ from: 'customer', to: 'ORDER', label: 'places' });
    expect(activity.source).toBe(customer.id);
    expect(activity.target).toBe(order.id);
  });

  it('reports ambiguous and unknown references', () => {
    const { story } = pizzaStory();
    story.addActor({ name: 'Customer' });
    expect(() => story.addActivity({ from: 'Customer', to: 'Order', label: 'x' })).toThrow(/ambiguous/i);
    expect(() => story.addActivity({ from: 'Nobody', to: 'Order', label: 'x' })).toThrow(/no element/i);
  });

  it('computes waypoints between the two shapes', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 100, y: 100 });
    const w = story.addWorkObject({ name: 'W', x: 300, y: 100 });
    const activity = story.addActivity({ from: a.id, to: w.id, label: 'uses' });
    expect(activity.waypoints.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 175, y: 138 },
      { x: 300, y: 138 },
    ]);
  });

  it('rejects actor-to-actor activities like Egon does', () => {
    const { story, customer, clerk } = pizzaStory();
    expect(() => story.addActivity({ from: customer.id, to: clerk.id, label: 'calls' })).toThrow(/two actors/i);
  });

  it('allows work object to work object activities without a number', () => {
    const { story, order } = pizzaStory();
    const receipt = story.addWorkObject({ name: 'Receipt' });
    expect(story.addActivity({ from: order.id, to: receipt.id, label: 'becomes' }).number ?? null).toBeNull();
  });

  it('accepts an explicit number for parallel steps', () => {
    const { story, customer, order, clerk } = pizzaStory();
    story.addActivity({ from: customer.id, to: order.id, label: 'places' });
    const parallel = story.addActivity({ from: clerk.id, to: order.id, label: 'reads', number: 1 });
    expect(parallel.number).toBe(1);
    expect(parallel.multipleNumberAllowed).toBe(true);
  });
});

describe('editing', () => {
  it('renames, recolors and changes the icon of an element', () => {
    const { story, customer } = pizzaStory();
    const updated = story.updateElement(customer.id, { name: 'Guest', icon: 'Group', color: '#43A047' });
    expect(updated).toMatchObject({ name: 'Guest', type: 'domainStory:actorGroup', pickedColor: '#43A047' });
  });

  it('moves a shape and reroutes its activities', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 100, y: 100 });
    const w = story.addWorkObject({ name: 'W', x: 300, y: 100 });
    const activity = story.addActivity({ from: a.id, to: w.id, label: 'uses' });
    story.updateElement(w.id, { x: 100, y: 300 });
    const moved = story.get(activity.id) as ActivityElement;
    expect(moved.waypoints.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 138, y: 175 },
      { x: 138, y: 300 },
    ]);
  });

  it('removes a shape together with its activities and renumbers the rest', () => {
    const { story, customer, order, clerk } = pizzaStory();
    story.addActivity({ from: customer.id, to: order.id, label: 'places' });
    const second = story.addActivity({ from: clerk.id, to: order.id, label: 'confirms' });
    const removed = story.removeElement(customer.id);
    expect(removed).toHaveLength(2);
    expect((story.get(second.id) as ActivityElement).number).toBe(1);
    expect(story.get(customer.id)).toBeUndefined();
  });

  it('moves an activity to another number and shifts the others', () => {
    const { story, customer, order, clerk } = pizzaStory();
    const a1 = story.addActivity({ from: customer.id, to: order.id, label: 'one' });
    const a2 = story.addActivity({ from: clerk.id, to: order.id, label: 'two' });
    const a3 = story.addActivity({ from: customer.id, to: order.id, label: 'three' });
    story.updateElement(a3.id, { number: 1 });
    const numbers = [a1, a2, a3].map((a) => (story.get(a.id) as ActivityElement).number);
    expect(numbers).toEqual([2, 3, 1]);
  });

  it('groups elements in a box around them', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 100, y: 100 });
    const w = story.addWorkObject({ name: 'W', x: 300, y: 100 });
    const group = story.addGroup({ name: 'Kitchen', members: [a.id, w.id] });
    expect(group.type).toBe('domainStory:group');
    expect(group.x).toBeLessThan(100);
    expect(group.y).toBeLessThan(100);
    expect(group.x + group.width).toBeGreaterThan(375);
    expect(group.y + group.height).toBeGreaterThan(175);
    expect(story.get(a.id)?.['parent']).toBe(group.id);
    story.removeElement(group.id);
    expect(story.get(a.id)).not.toHaveProperty('parent');
  });

  it('groups every element of a repeated name and annotates the first one', () => {
    const story = Story.create({ title: 'T' });
    const first = story.addWorkObject({ name: 'Slip' });
    const second = story.addWorkObject({ name: 'Slip' });
    const group = story.addGroup({ name: 'Desk', members: ['Slip'] });
    expect([first, second].map((e) => story.get(e.id)?.['parent'])).toEqual([group.id, group.id]);
    expect(story.addAnnotation({ text: 'Paper', attachTo: 'slip' }).connection?.source).toBe(first.id);
    expect(() => story.removeElement('Slip')).toThrow(/ambiguous/);
  });

  it('prefers actors and work objects over groups of the same name', () => {
    const story = Story.create({ title: 'T' });
    const kitchen = story.addActor({ name: 'Kitchen' });
    story.addWorkObject({ name: 'Pizza' });
    const kitchenGroup = story.addGroup({ name: 'Kitchen', members: ['Kitchen', 'Pizza'] });
    const restaurant = story.addGroup({ name: 'Restaurant', members: ['Kitchen'] });
    expect(story.get(kitchen.id)?.['parent']).toBe(restaurant.id);
    expect(story.get(kitchenGroup.id)).not.toHaveProperty('parent');
    expect(story.addAnnotation({ text: 'Wood-fired', attachTo: 'Kitchen' }).connection?.source).toBe(kitchen.id);
  });

  it('connects the actor when a group shares its name, but edits need the id', () => {
    const story = Story.create({ title: 'T' });
    const kitchen = story.addActor({ name: 'Kitchen' });
    story.addWorkObject({ name: 'Pizza' });
    story.addGroup({ name: 'Kitchen', members: ['Kitchen'] });
    expect(story.addActivity({ from: 'Kitchen', to: 'Pizza', label: 'bakes' }).source).toBe(kitchen.id);
    expect(() => story.updateElement('Kitchen', { name: 'Galley' })).toThrow(/ambiguous/);
    expect(() => story.removeElement('Kitchen')).toThrow(/ambiguous/);
  });

  it('refuses a blank id or name', () => {
    const story = Story.create({ title: 'T' });
    story.addActor({ name: '' });
    story.addWorkObject({ name: 'Pizza' });
    expect(() => story.addActivity({ from: '   ', to: 'Pizza', label: 'bakes' })).toThrow(/needs an id or name/);
    expect(() => story.updateElement('', { name: 'Baker' })).toThrow(/needs an id or name/);
    expect(() => story.addGroup({ name: 'G', members: [' '] })).toThrow(/needs an id or name/);
  });

  it('calls a name ambiguous unless it only repeats a work object', () => {
    const story = Story.create({ title: 'T' });
    story.addGroup({ name: 'Area' });
    story.addGroup({ name: 'Area' });
    expect(() => story.addAnnotation({ text: 'Note', attachTo: 'Area' })).toThrow(/ambiguous/);
    story.addActor({ name: 'Ann' });
    story.addActor({ name: 'Ann' });
    expect(() => story.addGroup({ name: 'Team', members: ['Ann'] })).toThrow(/ambiguous/);
    story.addActor({ name: 'Form' });
    story.addWorkObject({ name: 'Form' });
    expect(() => story.addGroup({ name: 'Paper', members: ['Form'] })).toThrow(/ambiguous/);
  });

  it('attaches a text annotation to an element', () => {
    const { story, order } = pizzaStory();
    const { annotation, connection } = story.addAnnotation({ text: 'Paper slip', attachTo: order.id });
    expect(annotation).toMatchObject({ type: 'domainStory:textAnnotation', text: 'Paper slip', name: '' });
    expect(annotation['number']).toBe(annotation.height);
    expect(connection).toMatchObject({ type: 'domainStory:connection', source: order.id, target: annotation.id });
  });

  it('updates title, description and scope', () => {
    const { story } = pizzaStory();
    story.setInfo({ title: 'New', scope: { pointInTime: 'to-be' } });
    expect(story.toDocument()).toMatchObject({ title: 'New', description: 'A customer orders a pizza.', scope: { pointInTime: 'to-be' } });
  });
});

describe('Story.fromDocument', () => {
  it('edits a story loaded from an Egon export', () => {
    const story = Story.fromDocument(parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'a.egn'));
    const before = story.toDocument().elements.length;
    const actor = story.addActor({ name: 'Newcomer' });
    expect(story.toDocument().elements).toHaveLength(before + 1);
    expect(story.toDocument().elements.filter((e) => e.id === actor.id)).toHaveLength(1);
  });

  it('returns copies so callers cannot change the story by accident', () => {
    const { story, customer } = pizzaStory();
    customer.name = 'Hacked';
    story.toDocument().elements[0]!.name = 'Hacked too';
    expect(story.get(customer.id)?.name).toBe('Customer');
  });
});
