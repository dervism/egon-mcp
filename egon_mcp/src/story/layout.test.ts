import { describe, expect, it } from 'vitest';
import { isActor, isWorkObject, type ActivityElement, type ShapeElement } from '../egon/types.js';
import { boundsOf } from './geometry.js';
import { autoLayout } from './layout.js';
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
});
