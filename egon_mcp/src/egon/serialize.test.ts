import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { Story } from '../story/story.js';
import { parseStoryFile } from './parse.js';
import { embedStoryInSvg, fileNameFor, toEgnJson } from './serialize.js';

function sampleStory() {
  const story = Story.create({ title: 'Order pizza', description: 'Happy path', scope: { pointInTime: 'as-is' } });
  const customer = story.addActor({ name: 'Customer' });
  const order = story.addWorkObject({ name: 'Order' });
  story.addActivity({ from: customer.id, to: order.id, label: 'places' });
  return story;
}

describe('toEgnJson', () => {
  it('writes the Egon 4 layout with iconSet first and domainStory second', () => {
    const json = JSON.parse(toEgnJson(sampleStory().toDocument()));
    expect(Object.keys(json)).toEqual(['iconSet', 'domainStory']);
    expect(Object.keys(json.domainStory)).toEqual(['businessObjects', 'title', 'description', 'version', 'scope']);
    expect(json.domainStory).toMatchObject({ title: 'Order pizza', description: 'Happy path', version: '4.0.0' });
    expect(json.iconSet.actors.Person).toMatch(/^<svg/);
  });

  it('sorts business objects by id like Egon does on export', () => {
    const ids = JSON.parse(toEgnJson(sampleStory().toDocument())).domainStory.businessObjects.map(
      (element: { id: string }) => element.id,
    );
    expect(ids).toEqual([...ids].sort((a: string, b: string) => a.localeCompare(b)));
  });

  it('round-trips through the parser', () => {
    const doc = sampleStory().toDocument();
    const reparsed = parseStoryFile(toEgnJson(doc), 'x.egn');
    expect(reparsed.title).toBe(doc.title);
    expect(reparsed.scope).toEqual(doc.scope);
    expect(reparsed.elements).toEqual(expect.arrayContaining(doc.elements));
    expect(reparsed.elements).toHaveLength(doc.elements.length);
  });

  it('round-trips an Egon export without losing elements', () => {
    const original = parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'a.egn');
    const again = parseStoryFile(toEgnJson(original), 'a.egn');
    expect(again.elements).toHaveLength(original.elements.length);
    expect(again.iconSet).toEqual(original.iconSet);
  });

  it('always writes the current Egon format version, because Egon treats a missing or old version as legacy', () => {
    const doc = parseStoryFile(readEgonFixture('dst_export_version_2_2_0.json'), 'a.dst');
    expect(JSON.parse(toEgnJson(doc)).domainStory.version).toBe('4.0.0');
  });

  it('omits an empty scope', () => {
    const json = JSON.parse(toEgnJson(Story.create({ title: 'T' }).toDocument()));
    expect(json.domainStory).not.toHaveProperty('scope');
  });
});

describe('embedStoryInSvg', () => {
  it('appends the story as escaped hidden text that the parser and Egon can read back', () => {
    const doc = sampleStory().toDocument();
    doc.elements[0]!.name = 'a <b> -- c';
    const svg = embedStoryInSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', doc);
    expect(svg).toContain("<text class='hiddenDomainStory' style='font-size: 0'>");
    expect(svg).toContain('%3CDST%3E');
    expect(svg).not.toMatch(/<DST>/);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    const renamed = parseStoryFile(svg, 'x.egn.svg').elements.find((e) => e.id === doc.elements[0]!.id);
    expect(renamed?.name).toBe('a <b> -- c');
  });

  it('escapes ampersands so the SVG stays well-formed XML', () => {
    const doc = sampleStory().toDocument();
    doc.title = 'Fish & Chips';
    const svg = embedStoryInSvg('<svg></svg>', doc);
    expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#\d+;)/);
    expect(parseStoryFile(svg, 'x.egn.svg').title).toBe('Fish & Chips');
  });
});

describe('fileNameFor', () => {
  it('builds a desktop-safe file name from the title', () => {
    expect(fileNameFor('Order: pizza/pasta?', 'egn')).toBe('Order pizzapasta.egn');
    expect(fileNameFor('Order pizza', 'egn.svg')).toBe('Order pizza.egn.svg');
    expect(fileNameFor('   ', 'egn')).toBe('domain-story.egn');
  });
});
