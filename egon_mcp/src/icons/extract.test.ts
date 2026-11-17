import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { egonSourceRoot } from '../../test/egon-fixtures.js';
import { isIconList } from '../build-info.js';
import { extractBuiltInIcons, generateIconFile, writeIconFile } from './extract.js';

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

describe('writeIconFile', () => {
  it('writes the icons through a temporary file and leaves nothing else behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-icons-'));
    try {
      const file = join(dir, 'builtin-icons.json');
      writeIconFile(file, extractBuiltInIcons(sample));
      expect(JSON.parse(readFileSync(file, 'utf8')).map((icon: { name: string }) => icon.name)).toEqual(['Person', 'Car']);
      expect(readdirSync(dir)).toEqual(['builtin-icons.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses an empty icon list and keeps the previous file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-icons-'));
    try {
      const file = join(dir, 'builtin-icons.json');
      writeFileSync(file, 'previous');
      expect(() => writeIconFile(file, [])).toThrow(/No built-in icons found/);
      expect(readFileSync(file, 'utf8')).toBe('previous');
      expect(readdirSync(dir)).toEqual(['builtin-icons.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('writeIconFile, interrupted', () => {
  it('replaces the file instead of writing into it, so a failed run leaves it whole', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-icons-'));
    try {
      const file = join(dir, 'builtin-icons.json');
      writeFileSync(file, 'previous');
      // A hard link shares the file's content: a write into the file would show
      // through it, while a new file renamed into place leaves it untouched.
      linkSync(file, join(dir, 'witness'));
      writeIconFile(file, extractBuiltInIcons(sample));
      expect(readFileSync(join(dir, 'witness'), 'utf8')).toBe('previous');
      expect(readFileSync(file, 'utf8')).toContain('"Person"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names its temporary file with a leading dot, so the build skips a leftover one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-icons-'));
    try {
      const file = join(dir, 'builtin-icons.json');
      // A folder in the way makes the final rename fail, and the error names the temporary file.
      mkdirSync(join(file, 'blocker'), { recursive: true });
      expect(() => writeIconFile(file, extractBuiltInIcons(sample))).toThrow(/[\\/]\.builtin-icons\.json\.\d+\.tmp/);
      expect(readdirSync(dir)).toEqual(['builtin-icons.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('generateIconFile', () => {
  it('extracts and writes the icons, and returns how many', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-icons-'));
    try {
      expect(generateIconFile(sample, join(dir, 'builtin-icons.json'))).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('explains a source it cannot read as a change in Egon, and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-icons-'));
    try {
      const file = join(dir, 'builtin-icons.json');
      expect(() => generateIconFile('const = ;', file)).toThrow(
        /Cannot read Egon's built-in icons \(.+\); its format may have changed\./,
      );
      // Sources may throw values that are not Error objects.
      expect(() => generateIconFile("throw 'boom'", file)).toThrow(/Cannot read Egon's built-in icons \(boom\)/);
      expect(existsSync(file)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses icons that the build would reject, naming the change in Egon as the cause', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-icons-'));
    try {
      const file = join(dir, 'builtin-icons.json');
      const unnamed = "const icons = new Dictionary();\nicons.putEntry(new Entry('<svg/>', '', ['x']));\n";
      expect(() => generateIconFile(unnamed, file, isIconList)).toThrow(
        /do not have the shape the server reads; its format may have changed/,
      );
      expect(existsSync(file)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
