import { describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile, StoryParseError } from './parse.js';

describe('parseStoryFile', () => {
  it('reads an Egon 4 .egn export', () => {
    const doc = parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'story.egn');

    expect(doc.title).toBe('testTitle');
    expect(doc.description).toBe('version 4.0.0 (implement new DomainStory model)');
    expect(doc.version).toBe('4.0.0');
    expect(doc.iconSet.name).toBe('default');
    expect(Object.keys(doc.iconSet.actors)).toEqual(['Person', 'Group', 'System']);
    expect(Object.keys(doc.iconSet.workObjects)).toContain('Document');
    expect(doc.elements).toHaveLength(13);

    const activity = doc.elements.find((e) => e.id === 'connection_5930');
    expect(activity).toMatchObject({
      type: 'domainStory:activity',
      source: 'shape_2543',
      target: 'shape_0469',
      number: 1,
    });
  });

  it('drops bpmn-io bookkeeping properties that Egon removes on import', () => {
    const doc = parseStoryFile(readEgonFixture('egn_export_version_4_0_0.json'), 'story.egn');
    for (const element of doc.elements) {
      expect(element).not.toHaveProperty('$type');
      expect(element).not.toHaveProperty('di');
      expect(element).not.toHaveProperty('$descriptor');
    }
  });

  it('reads a 2.x .dst export where dst is an array with info and version entries', () => {
    const doc = parseStoryFile(readEgonFixture('dst_export_version_2_2_0.json'), 'old.dst');

    expect(doc.version).toBe('2.2.0');
    expect(doc.description).toBe('version 2.2.0');
    expect(doc.title).toBe('old');
    expect(doc.elements.every((e) => typeof e.type === 'string')).toBe(true);
    expect(Object.keys(doc.iconSet.actors)).toContain('Person');
  });

  it('reads a 1.x .dst export where domain and dst are JSON strings', () => {
    const doc = parseStoryFile(readEgonFixture('dst_export_version_1_5_0.json'), 'legacy.dst');

    expect(doc.version).toBe('1.5.0');
    expect(doc.elements.length).toBeGreaterThan(5);
    expect(Object.keys(doc.iconSet.workObjects)).toContain('Document');
  });

  it('reads a story embedded in an .egn.svg export', () => {
    const egn = readEgonFixture('egn_export_version_4_0_0.json');
    const escaped = egn.replaceAll('--', '––').replaceAll('<', '%3C').replaceAll('>', '%3E');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g/>
<text class='hiddenDomainStory' style='font-size: 0'>

%3CDST%3E${escaped}%3C/DST%3E

</text>
</svg>`;

    const doc = parseStoryFile(svg, 'My story_2024-01-02.egn.svg');

    expect(doc.title).toBe('testTitle');
    expect(doc.elements).toHaveLength(13);
  });

  it('restores the title from the file name when the file has none', () => {
    const doc = parseStoryFile(
      JSON.stringify({ domainStory: { businessObjects: [] }, iconSet: { name: 'x', actors: {}, workObjects: {} } }),
      'Order pizza_2024-05-06.egn',
    );
    expect(doc.title).toBe('Order pizza');
  });

  it('keeps the scope of a story', () => {
    const doc = parseStoryFile(
      JSON.stringify({
        domainStory: {
          businessObjects: [],
          title: 't',
          scope: { pointInTime: 'to-be', domainPurity: 'pure', granularity: 'fine-grained' },
        },
        iconSet: { name: 'x', actors: {}, workObjects: {} },
      }),
      'a.egn',
    );
    expect(doc.scope).toEqual({ pointInTime: 'to-be', domainPurity: 'pure', granularity: 'fine-grained' });
  });

  it('rejects text that is not a domain story', () => {
    expect(() => parseStoryFile('not json', 'a.egn')).toThrow(StoryParseError);
    expect(() => parseStoryFile('{"hello": 1}', 'a.egn')).toThrow(StoryParseError);
    expect(() => parseStoryFile('<svg></svg>', 'a.egn.svg')).toThrow(/no embedded domain story/i);
  });
});
