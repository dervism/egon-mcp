import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { Story } from '../story/story.js';
import { parseStoryFile } from './parse.js';
import { compareIds } from './types.js';
import { embedStoryInSvg, fileNameFor, toEgnJson } from './serialize.js';

function sampleStory() {
  const story = Story.create({ title: 'Order pizza', description: 'Happy path', scope: { pointInTime: 'as-is' } });
  const customer = story.addActor({ name: 'Customer' });
  const order = story.addWorkObject({ name: 'Order' });
  story.addActivity({ from: customer.id, to: order.id, label: 'places' });
  return story;
}

describe('toEgnJson', () => {
  it('writes the Egon 3 layout by default, which egon.io 3.2.1 and Egon 4 both import', () => {
    const json = JSON.parse(toEgnJson(sampleStory().toDocument()));
    expect(Object.keys(json)).toEqual(['domain', 'dst']);
    expect(json.domain.actors.Person).toMatch(/^<svg/);
    expect(json.dst.slice(-2)).toEqual([{ info: 'Happy path' }, { version: '3.2.1' }]);
    expect(json.dst.slice(0, -2).every((element: { id?: string }) => typeof element.id === 'string')).toBe(true);
  });

  it('writes the Egon 4 layout on request, with title and scope inside the file', () => {
    const json = JSON.parse(toEgnJson(sampleStory().toDocument(), { format: 'egon4' }));
    expect(Object.keys(json)).toEqual(['iconSet', 'domainStory']);
    expect(Object.keys(json.domainStory)).toEqual(['businessObjects', 'title', 'description', 'version', 'scope']);
    expect(json.domainStory).toMatchObject({ title: 'Order pizza', description: 'Happy path', version: '4.0.0' });
  });

  it('writes a group after the group it is in, since Egon nests a group only in one it has already read', () => {
    const doc = Story.fromDocument(
      parseStoryFile(
        JSON.stringify({
          domain: { name: 'default', actors: {}, workObjects: {} },
          dst: [
            { type: 'domainStory:group', id: 'shape_9000', name: 'Outer', x: 0, y: 0, width: 1000, height: 1000 },
            { type: 'domainStory:group', id: 'shape_5000', name: 'Middle', x: 50, y: 50, width: 600, height: 600, parent: 'shape_9000' },
            { type: 'domainStory:group', id: 'shape_1000', name: 'Inner', x: 100, y: 100, width: 300, height: 300, parent: 'shape_5000' },
            { type: 'domainStory:actorPerson', id: 'shape_0001', name: 'A', x: 150, y: 150, parent: 'shape_1000' },
            { info: '' },
            { version: '3.2.1' },
          ],
        }),
        'story.egn',
      ),
    ).toDocument();
    for (const format of ['egon3', 'egon4'] as const) {
      const json = JSON.parse(toEgnJson(doc, { format }));
      const elements: { id: string }[] = format === 'egon3' ? json.dst.slice(0, -2) : json.domainStory.businessObjects;
      const at = (id: string) => elements.findIndex((element) => element.id === id);
      expect(at('shape_9000')).toBeLessThan(at('shape_5000'));
      expect(at('shape_5000')).toBeLessThan(at('shape_1000'));
    }
  });

  it('writes ids in the order of their numbers, so shape_9999 comes before shape_10000', () => {
    const story = Story.fromDocument(
      parseStoryFile(
        JSON.stringify({ domain: { name: 'default', actors: {}, workObjects: {} }, dst: [{ type: 'domainStory:actorPerson', id: 'shape_9999', name: 'A', x: 0, y: 0 }, { info: '' }, { version: '3.2.1' }] }),
        'story.egn',
      ),
    );
    story.addActor({ name: 'B' });
    const ids = JSON.parse(toEgnJson(story.toDocument())).dst.slice(0, -2).map((element: { id: string }) => element.id);
    expect(ids).toEqual(['shape_9999', 'shape_10000']);
  });

  it('sorts business objects by id, as Egon does on export', () => {
    for (const format of ['egon3', 'egon4'] as const) {
      const json = JSON.parse(toEgnJson(sampleStory().toDocument(), { format }));
      const elements = format === 'egon3' ? json.dst.slice(0, -2) : json.domainStory.businessObjects;
      const ids = elements.map((element: { id: string }) => element.id);
      expect(ids).toEqual([...ids].sort(compareIds));
    }
  });

  it('round-trips through the parser in both layouts', () => {
    const doc = sampleStory().toDocument();
    for (const format of ['egon3', 'egon4'] as const) {
      const reparsed = parseStoryFile(toEgnJson(doc, { format }), fileNameFor(doc.title, 'egn'));
      expect(reparsed.title).toBe(doc.title);
      expect(reparsed.description).toBe(doc.description);
      expect(reparsed.elements).toEqual(expect.arrayContaining(doc.elements));
      expect(reparsed.elements).toHaveLength(doc.elements.length);
    }
    expect(parseStoryFile(toEgnJson(doc, { format: 'egon4' }), 'x.egn').scope).toEqual(doc.scope);
  });

  it('round-trips an Egon export without losing elements', () => {
    const original = parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'a.egn');
    const again = parseStoryFile(toEgnJson(original), 'a.egn');
    expect(again.elements).toHaveLength(original.elements.length);
    expect(again.iconSet).toEqual(original.iconSet);
  });

  it('always writes the current version of the chosen layout, because Egon treats a missing or old version as legacy', () => {
    const doc = parseStoryFile(readEgonFixture('dst_export_version_2_2_0.json'), 'a.dst');
    expect(JSON.parse(toEgnJson(doc)).dst.at(-1)).toEqual({ version: '3.2.1' });
    expect(JSON.parse(toEgnJson(doc, { format: 'egon4' })).domainStory.version).toBe('4.0.0');
  });

  it('omits an empty scope', () => {
    const json = JSON.parse(toEgnJson(Story.create({ title: 'T' }).toDocument(), { format: 'egon4' }));
    expect(json.domainStory).not.toHaveProperty('scope');
  });
});

describe('embedStoryInSvg', () => {
  it('appends the story as a <DST> comment after </svg>, where Egon 3 and 4 look for it', () => {
    const doc = sampleStory().toDocument();
    doc.elements[0]!.name = 'a <b> -- c & d';
    const svg = embedStoryInSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', doc);
    expect(svg).toMatch(/<\/svg>\n<!-- <DST>\n[\s\S]*\n <\/DST> -->$/);
    const comment = svg.slice(svg.indexOf('<!--') + 4, svg.lastIndexOf('-->'));
    expect(comment).not.toContain('--');
    expect(XMLValidator.validate(svg)).toBe(true);
    const renamed = parseStoryFile(svg, 'Order pizza.egn.svg').elements.find((e) => e.id === doc.elements[0]!.id);
    expect(renamed?.name).toBe('a <b> -- c & d');
  });

  it('can embed the Egon 4 layout', () => {
    const doc = sampleStory().toDocument();
    const svg = embedStoryInSvg('<svg></svg>', doc, { format: 'egon4' });
    expect(parseStoryFile(svg, 'x.egn.svg').title).toBe('Order pizza');
  });
});

describe('fileNameFor', () => {
  it('builds a desktop-safe file name from the title', () => {
    expect(fileNameFor('Order: pizza/pasta?', 'egn')).toBe('Order pizzapasta.egn');
    expect(fileNameFor('Order pizza', 'egn.svg')).toBe('Order pizza.egn.svg');
    expect(fileNameFor('   ', 'egn')).toBe('domain-story.egn');
  });
});
