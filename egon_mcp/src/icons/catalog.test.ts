import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ICON_NAMES, IconCatalog } from './catalog.js';

describe('IconCatalog', () => {
  const catalog = IconCatalog.builtIn();

  it('lists every built-in Egon icon', () => {
    expect(catalog.names().length).toBeGreaterThan(100);
    expect(catalog.names()).toContain('Person');
    expect(catalog.names()).toContain('Document');
  });

  it('looks up icons case-insensitively and returns the canonical name', () => {
    expect(catalog.get('person')?.name).toBe('Person');
    expect(catalog.get('PICTURE-AS-pdf')?.name).toBe('Picture-as-PDF');
    expect(catalog.get('no such icon')).toBeUndefined();
  });

  it('finds icons by keyword, ranking exact name matches first', () => {
    const results = catalog.search('car');
    expect(results[0]?.name).toBe('Car');
    expect(results.map((icon) => icon.name)).toContain('Truck');
    expect(catalog.search('')).toEqual([]);
  });

  it('matches multi-word queries against names and keywords', () => {
    const names = catalog.search('credit card').map((icon) => icon.name);
    expect(names[0]).toBe('Credit-Card');
  });

  it('knows the default icon set Egon starts with', () => {
    expect(DEFAULT_ICON_NAMES).toEqual({
      actors: ['Person', 'Group', 'System'],
      workObjects: ['Document', 'Folder', 'Call', 'Email', 'Conversation', 'Info'],
    });
    const iconSet = catalog.defaultIconSet();
    expect(Object.keys(iconSet.actors)).toEqual(DEFAULT_ICON_NAMES.actors);
    expect(iconSet.actors['Person']).toMatch(/^<svg/);
    expect(iconSet.name).toBe('default');
  });
});

describe('IconCatalog.fromFile', () => {
  const fix = 'run "npm run generate:icons", then "npm run build"';
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'egon-catalog-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('names the file and both steps that bring missing icon data back', () => {
    expect(() => IconCatalog.fromFile(pathToFileURL(join(dir, 'missing', 'builtin-icons.json')))).toThrow(
      `${join(dir, 'missing', 'builtin-icons.json')} is missing; ${fix}`,
    );
  });

  it('refuses a file that is cut off or not in the shape the server reads', () => {
    const file = join(dir, 'builtin-icons.json');
    for (const content of ['[{ "name": "Per', '[{ "name": "Person", "svg": "<svg/>" }]']) {
      writeFileSync(file, content);
      expect(() => IconCatalog.fromFile(pathToFileURL(file)), content).toThrow(`${file} is not usable; ${fix}`);
    }
  });

  const unreadable = (code: string) =>
    new RegExp(
      `cannot be read \\(${code}, \\w+\\)\\. Fix the access rights or remove whatever is in the way on this path, then run "npm run generate:icons", then "npm run build"`,
    );

  it('says why a path it cannot read failed, names it once, and how to clear it', () => {
    const file = join(dir, 'builtin-icons.json');
    mkdirSync(file);
    let message = '';
    try {
      IconCatalog.fromFile(pathToFileURL(file));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(unreadable('EISDIR'));
    expect(message.split(file)).toHaveLength(2);
  });

  it('covers a file in the way of a folder on the path', () => {
    writeFileSync(join(dir, 'generated'), 'not a folder');
    expect(() => IconCatalog.fromFile(pathToFileURL(join(dir, 'generated', 'builtin-icons.json')))).toThrow(unreadable('ENOTDIR'));
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)('does not call an unreadable folder a missing file', () => {
    const locked = join(dir, 'locked');
    mkdirSync(locked);
    writeFileSync(join(locked, 'builtin-icons.json'), '[]');
    chmodSync(locked, 0o000);
    try {
      expect(() => IconCatalog.fromFile(pathToFileURL(join(locked, 'builtin-icons.json')))).toThrow(unreadable('EACCES'));
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('is the only way the built-in icons are loaded, the default file included', async () => {
    vi.resetModules();
    const { IconCatalog: Fresh } = await import('./catalog.js');
    const fromFile = vi.spyOn(Fresh, 'fromFile');
    try {
      Fresh.builtIn();
      Fresh.builtIn();
      expect(fromFile).toHaveBeenCalledTimes(1);
    } finally {
      fromFile.mockRestore();
    }
  });

  it('applies to the built-in icons the server loads', () => {
    const file = join(dir, 'builtin-icons.json');
    writeFileSync(file, '[]');
    expect(() => IconCatalog.builtIn(pathToFileURL(file))).toThrow(`${file} is not usable; ${fix}`);
    expect(IconCatalog.builtIn().names().length).toBeGreaterThan(100);
  });
});
