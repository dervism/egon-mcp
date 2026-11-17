import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
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
    expect(story.toDocument().iconSet.workObjects['Pizza']).toMatch(/^data:image\/svg\+xml;base64,/);
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
