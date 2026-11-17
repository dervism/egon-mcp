import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { egonSourceRoot } from '../../test/egon-fixtures.js';
import { extractBuiltInIcons } from './extract.js';

const sample = `import { Dictionary, Entry } from 'src/app/domain/entities/dictionary';
const people = ['person', 'group'];
export const builtInIcons = new Dictionary<string>();
const person = new Entry(
  '<svg viewBox="0 0 24 26"><path d="M1 1"/></svg>',
  'Person',
  [...people, 'human'],
);
builtInIcons.putEntry(person);
const car = new Entry('<svg><circle r="2"/></svg>', 'Car', ['car']);
builtInIcons.putEntry(car);
builtInIcons.putEntry(car);
`;

describe('extractBuiltInIcons', () => {
  it('reads name, svg and keywords from the Egon icon source format', () => {
    expect(extractBuiltInIcons(sample)).toEqual([
      {
        name: 'Person',
        svg: '<svg viewBox="0 0 24 26"><path d="M1 1"/></svg>',
        keywords: ['person', 'group', 'human'],
      },
      { name: 'Car', svg: '<svg><circle r="2"/></svg>', keywords: ['car'] },
    ]);
  });

  it('cannot reach Node globals while evaluating the source', () => {
    const hostile = `export const builtInIcons = new Dictionary();
builtInIcons.putEntry(new Entry(typeof process, 'Probe', []));`;
    expect(extractBuiltInIcons(hostile)).toEqual([
      { name: 'Probe', svg: 'undefined', keywords: [] },
    ]);
  });

  it('extracts every built-in icon from the egon.io submodule', () => {
    const source = readFileSync(
      join(egonSourceRoot, 'src/app/tools/icon-set-config/domain/builtInIcons.ts'),
      'utf8',
    );
    const icons = extractBuiltInIcons(source);
    expect(icons.length).toBeGreaterThan(100);
    const person = icons.find((icon) => icon.name === 'Person');
    expect(person?.svg).toMatch(/^<svg/);
    expect(person?.keywords).toContain('person');
    expect(new Set(icons.map((icon) => icon.name)).size).toBe(icons.length);
  });
});
