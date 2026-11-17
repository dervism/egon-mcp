import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { egonSourceRoot } from '../../test/egon-fixtures.js';
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
  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'never writes into the existing file, so a failed run leaves it whole',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'egon-icons-'));
      const file = join(dir, 'builtin-icons.json');
      writeFileSync(file, 'previous');
      // The file stays writable but no new file can be made next to it: a write
      // straight into the file would succeed, a temporary file cannot.
      chmodSync(dir, 0o555);
      try {
        expect(() => writeIconFile(file, extractBuiltInIcons(sample))).toThrow();
        expect(readFileSync(file, 'utf8')).toBe('previous');
      } finally {
        chmodSync(dir, 0o755);
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

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

  it('explains a source it cannot read as a change in Egon', () => {
    expect(() => generateIconFile('const = ;', join(tmpdir(), 'never-written.json'))).toThrow(
      /Cannot read Egon's built-in icons \(.+\); its format may have changed\./,
    );
  });
});
