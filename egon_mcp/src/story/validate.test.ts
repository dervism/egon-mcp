import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import type { StoryDocument } from '../egon/types.js';
import { Story } from './story.js';
import { validateStory } from './validate.js';

function codes(doc: StoryDocument) {
  return validateStory(doc).map((issue) => issue.code);
}

function goodStory() {
  const story = Story.create({ title: 'Order pizza' });
  const customer = story.addActor({ name: 'Customer' });
  const order = story.addWorkObject({ name: 'Order' });
  const clerk = story.addActor({ name: 'Clerk' });
  story.addActivity({ from: customer.id, to: order.id, label: 'tells' });
  story.addActivity({ from: order.id, to: clerk.id, label: 'to' });
  return story;
}

describe('validateStory', () => {
  it('finds nothing wrong with a well-formed story', () => {
    expect(validateStory(goodStory().toDocument())).toEqual([]);
  });

  it('reports edges that point to missing elements as errors', () => {
    const doc = goodStory().toDocument();
    const edge = doc.elements.find((e) => e.type === 'domainStory:activity')! as { source: string };
    edge.source = 'shape_missing';
    const issues = validateStory(doc);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'dangling-reference', severity: 'error' }));
  });

  it('reports activities between two actors, which Egon cannot draw', () => {
    const doc = goodStory().toDocument();
    const [customer, clerk] = doc.elements.filter((e) => e.type.startsWith('domainStory:actor'));
    doc.elements.push({
      type: 'domainStory:activity',
      id: 'connection_9999',
      name: 'calls',
      source: customer!.id,
      target: clerk!.id,
      waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      number: 2,
    });
    expect(codes(doc)).toContain('actor-to-actor');
  });

  it('reports activities with fewer than two waypoints', () => {
    const doc = goodStory().toDocument();
    const activity = doc.elements.find((e) => e.type === 'domainStory:activity') as { waypoints: unknown[] };
    activity.waypoints = [];
    expect(codes(doc)).toContain('missing-waypoints');
  });

  it('warns about missing names and labels', () => {
    const story = Story.create({ title: 'T' });
    const actor = story.addActor({ name: '' });
    const thing = story.addWorkObject({ name: 'Form' });
    story.addActivity({ from: actor.id, to: thing.id });
    expect(codes(story.toDocument())).toEqual(expect.arrayContaining(['unnamed-element', 'unlabeled-activity']));
  });

  it('warns about actors and work objects that take part in no activity', () => {
    const story = goodStory();
    story.addWorkObject({ name: 'Menu' });
    const issues = validateStory(story.toDocument());
    expect(issues).toContainEqual(expect.objectContaining({ code: 'unconnected-element', severity: 'warning' }));
  });

  it('checks the numbering of steps', () => {
    const doc = goodStory().toDocument();
    const first = doc.elements.find((e) => e.type === 'domainStory:activity' && (e as { number?: number }).number === 1)!;
    (first as { number?: number }).number = 3;
    expect(codes(doc)).toContain('numbering-gap');

    const unnumbered = goodStory().toDocument();
    const fromActor = unnumbered.elements.find((e) => (e as { number?: number }).number === 1)!;
    (fromActor as { number?: number | null }).number = null;
    expect(codes(unnumbered)).toContain('missing-number');
  });

  it('flags icons that neither Egon nor the story file can draw', () => {
    const doc = goodStory().toDocument();
    doc.elements[0]!.type = 'domainStory:actorPizzaiolo';
    expect(codes(doc)).toContain('unknown-icon');
  });

  it('warns when shapes overlap', () => {
    const story = Story.create({ title: 'T' });
    story.addActor({ name: 'A', x: 100, y: 100 });
    story.addActor({ name: 'B', x: 110, y: 110 });
    expect(codes(story.toDocument())).toContain('overlapping-shapes');
  });

  it('warns about a missing or placeholder title', () => {
    expect(codes(Story.create({ title: '' }).toDocument())).toContain('missing-title');
    expect(codes(Story.create({ title: 'Click to add title' }).toDocument())).toContain('missing-title');
  });

  it('flags duplicate ids', () => {
    const doc = goodStory().toDocument();
    doc.elements.push({ ...doc.elements[0]! });
    expect(codes(doc)).toContain('duplicate-id');
  });

  it('reads an Egon sample without errors', () => {
    const doc = parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'a.egn');
    expect(validateStory(doc).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('warns about a smaller group whose corner touches the edge of a larger group it is not in', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 0, y: 0 });
    const b = story.addActor({ name: 'B', x: 0, y: 400 });
    const c = story.addActor({ name: 'C', x: 155, y: 100 });
    story.addGroup({ name: 'Big', members: [a.id, b.id] });
    story.addGroup({ name: 'Small', members: [c.id] });
    expect(codes(story.toDocument())).toContain('group-encloses-non-member');
  });

  it('warns when a group box encloses an element that is not in the group, or overlaps another group', () => {
    // Boxes fitted around their members take in nothing else, unlike boxes drawn with coordinates.
    const story = Story.create({ title: 'T' });
    const inside = story.addActor({ name: 'Inside', x: 100, y: 100 });
    story.addActor({ name: 'Stranger', x: 150, y: 150 });
    story.addWorkObject({ name: 'Elsewhere', x: 200, y: 100 });
    story.addGroup({ name: 'Area', members: [inside.id] });
    story.addGroup({ name: 'Other', members: ['Elsewhere'] });
    const found = codes(story.toDocument());
    expect(found).toContain('group-encloses-non-member');
    expect(found).toContain('overlapping-groups');
  });

  it('accepts groups nested in each other', () => {
    const story = Story.create({ title: 'T' });
    const a = story.addActor({ name: 'A', x: 100, y: 100 });
    const inner = story.addGroup({ name: 'Inner', members: [a.id], x: 60, y: 60, width: 160, height: 160 });
    story.addGroup({ name: 'Outer', members: [inner.id], x: 20, y: 20, width: 260, height: 260 });
    expect(codes(story.toDocument())).not.toContain('overlapping-groups');
    expect(codes(story.toDocument())).not.toContain('group-encloses-non-member');
  });
});
