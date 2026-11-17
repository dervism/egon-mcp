import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import { autoLayout } from '../story/layout.js';
import { Story } from '../story/story.js';
import { renderStorySvg } from './svg.js';

function pizza() {
  const story = Story.create({ title: 'Order <pizza> & more', description: 'Line one' });
  story.addActor({ name: 'Customer' });
  story.addWorkObject({ name: 'Order' });
  story.addActor({ name: 'Clerk', color: '#E53935' });
  story.addActivity({ from: 'Customer', to: 'Order', label: 'tells' });
  story.addActivity({ from: 'Order', to: 'Clerk', label: 'to' });
  story.addGroup({ name: 'Shop', members: ['Clerk'] });
  story.addAnnotation({ text: 'by phone', attachTo: 'Order' });
  autoLayout(story);
  return story;
}

describe('renderStorySvg', () => {
  it('produces well-formed SVG', () => {
    const svg = renderStorySvg(pizza().toDocument());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('draws names, labels, step numbers, groups and annotations', () => {
    const svg = renderStorySvg(pizza().toDocument());
    for (const text of ['Customer', 'Order', 'Clerk', 'tells', '>to<', 'Shop', 'by phone', '>1<']) {
      expect(svg).toContain(text);
    }
    expect(svg).toContain('marker-end');
    expect(svg).toContain('stroke-dasharray');
  });

  it('escapes text and includes the title only when asked', () => {
    const doc = pizza().toDocument();
    // The accessible <title> element is always there; the visible heading is optional.
    expect(renderStorySvg(doc)).not.toContain('font-size="30"');
    const withTitle = renderStorySvg(doc, { title: true });
    expect(withTitle).toContain('font-size="30"');
    expect(withTitle).toContain('Order &lt;pizza&gt; &amp; more');
    expect(withTitle).toContain('Line one');
    expect(XMLValidator.validate(withTitle)).toBe(true);
  });

  it('embeds the icon of each actor and work object, recolored when a color is picked', () => {
    const svg = renderStorySvg(pizza().toDocument());
    expect((svg.match(/<svg /g) ?? []).length).toBeGreaterThan(3);
    expect(svg).toContain('#E53935');
  });

  it('strips scripts and event handlers from icons in untrusted files', () => {
    const doc = Story.create({ title: 'T' }).toDocument();
    doc.iconSet.actors['Evil'] = '<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><circle r="3"/></svg>';
    doc.elements.push({ type: 'domainStory:actorEvil', id: 'shape_1', name: 'x', x: 0, y: 0 });
    const svg = renderStorySvg(doc);
    expect(svg).not.toMatch(/<script|onload/i);
    expect(svg).toContain('<circle');
  });

  it('renders an Egon export', () => {
    const doc = parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'a.egn');
    const svg = renderStorySvg(doc);
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toContain('&lt;script&gt;');
  });

  it('can embed the story so Egon imports the image as .egn.svg', () => {
    const doc = pizza().toDocument();
    const svg = renderStorySvg(doc, { embedStory: true });
    expect(svg).toContain('%3CDST%3E');
    expect(parseStoryFile(svg, 'x.egn.svg').elements).toHaveLength(doc.elements.length);
  });

  it('renders an empty story as a small valid image', () => {
    const svg = renderStorySvg(Story.create({ title: 'Empty' }).toDocument());
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toMatch(/viewBox="[-\d.]+ [-\d.]+ \d+ \d+"/);
  });

  it('puts the label of a bent activity on its last long horizontal segment, like Egon', () => {
    const story = Story.create({ title: 'T' });
    story.addActor({ name: 'A', x: 0, y: 100 });
    story.addWorkObject({ name: 'W', x: 200, y: 100 });
    story.addActor({ name: 'B', x: 400, y: 100 });
    story.addActivity({ from: 'B', to: 'W', label: 'back' });
    story.addActivity({ from: 'W', to: 'A', label: 'over' });
    story.addActivity({ from: 'A', to: 'W', label: 'x' });
    // B -> W is straight; W -> A is straight; add one that has to bend.
    story.addWorkObject({ name: 'V', x: 600, y: 100 });
    const bent = story.addActivity({ from: 'A', to: 'V', label: 'detour' });
    expect(bent.waypoints).toHaveLength(4);
    const svg = renderStorySvg(story.toDocument());
    const laneY = bent.waypoints[1]!.y;
    expect(svg).toMatch(new RegExp(`<tspan x="[\\d.]+" y="${laneY + 15}">detour</tspan>`));
  });
});
