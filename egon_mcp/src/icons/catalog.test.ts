import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockingAncestor, DEFAULT_ICON_NAMES, IconCatalog, iconReadError, isFileSystemError, readErrorReason } from './catalog.js';

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

  const unreadable = (code: string, reason: string) =>
    new RegExp(
      `cannot be read \\(${code}: ${reason}\\)\\. Fix what stops it from being read, such as access rights or a file or folder in the way, then run "npm run generate:icons", then "npm run build"`,
    );
  /** The message, which must name the path exactly once. */
  const messageFor = (file: string) => {
    try {
      IconCatalog.fromFile(pathToFileURL(file));
    } catch (error) {
      const message = (error as Error).message;
      expect(message.split(file)).toHaveLength(2);
      return message;
    }
    throw new Error('fromFile did not fail');
  };

  it('says why a path it cannot read failed, names it once, and how to clear it', () => {
    const file = join(dir, 'builtin-icons.json');
    mkdirSync(file);
    expect(messageFor(file)).toMatch(unreadable('EISDIR', 'illegal operation on a directory'));
  });

  it('covers a file in the way of a folder on the path', () => {
    writeFileSync(join(dir, 'generated'), 'not a folder');
    // POSIX reports ENOTDIR and Windows a missing path; both name the file in the way.
    expect(messageFor(join(dir, 'generated', 'builtin-icons.json'))).toContain(
      `cannot be read (${join(dir, 'generated')} is a file, not a folder). Fix what stops it from being read`,
    );
  });

  it('names an existing file read as a folder, whatever error the platform reports', () => {
    const file = join(dir, 'builtin-icons.json');
    writeFileSync(file, '[]');
    // A trailing slash fails with ENOTDIR on POSIX and as a missing path on Windows.
    expect(() => IconCatalog.fromFile(new URL(`${pathToFileURL(file).href}/`))).toThrow(
      `cannot be read (${file} is a file, not a folder)`,
    );
  });

  it('reports a path the system refuses in its own words instead of throwing a raw error', () => {
    const url = new URL(`${pathToFileURL(join(dir, 'a')).href}%00b/builtin-icons.json`);
    expect(() => IconCatalog.fromFile(url)).toThrow(/^Built-in icon data .* cannot be read \(/);
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)('does not call an unreadable folder a missing file', () => {
    const locked = join(dir, 'locked');
    mkdirSync(locked);
    writeFileSync(join(locked, 'builtin-icons.json'), '[]');
    chmodSync(locked, 0o000);
    try {
      expect(messageFor(join(locked, 'builtin-icons.json'))).toMatch(unreadable('EACCES', 'permission denied'));
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

describe('readErrorReason', () => {
  it('uses the system text for system errors, without the path that Node repeats', () => {
    let error: unknown;
    try {
      readFileSync(tmpdir());
    } catch (thrown) {
      error = thrown;
    }
    expect(readErrorReason(error)).toBe('EISDIR: illegal operation on a directory');
  });

  it('falls back to the message for errors without a system error number', () => {
    const tooLarge = Object.assign(new Error('File size (3000000000) is greater than 2 GiB'), { code: 'ERR_FS_FILE_TOO_LARGE' });
    expect(readErrorReason(tooLarge)).toBe('File size (3000000000) is greater than 2 GiB');
    // libuv error numbers are negative integers; getSystemErrorMessage throws for anything else.
    for (const errno of [13, 0, -1.5, Number.NEGATIVE_INFINITY]) {
      expect(readErrorReason(Object.assign(new Error('raw text'), { code: 'EACCES', errno })), String(errno)).toBe('raw text');
    }
    expect(readErrorReason('not an error')).toBe('unknown error');
  });
});

describe('blockingAncestor', () => {
  it('finds a file standing where a folder on the path should be', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-catalog-'));
    try {
      expect(blockingAncestor(join(dir, 'generated', 'builtin-icons.json'))).toBeUndefined();
      writeFileSync(join(dir, 'generated'), 'not a folder');
      expect(blockingAncestor(join(dir, 'generated', 'builtin-icons.json'))).toBe(join(dir, 'generated'));
      expect(blockingAncestor(join(dir, 'generated', 'deeper', 'builtin-icons.json'))).toBe(join(dir, 'generated'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'treats a folder it cannot look into as nothing in the way, so the server still reports its own message',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'egon-catalog-'));
      const locked = join(dir, 'locked');
      mkdirSync(locked);
      chmodSync(locked, 0o000);
      try {
        const path = join(locked, 'inner', 'x', 'builtin-icons.json');
        expect(blockingAncestor(path)).toBeUndefined();
        expect(iconReadError(path, failedRead(join(dir, 'nope'))).message).toBe(
          `Built-in icon data ${path} is missing; run "npm run generate:icons", then "npm run build" in egon_mcp (needs the egon.io submodule).`,
        );
      } finally {
        chmodSync(locked, 0o755);
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('passes on errors that are not about the file system, such as a bad path', () => {
    expect(() => blockingAncestor(join(tmpdir(), 'a\0b', 'builtin-icons.json'))).toThrow(/null bytes|ERR_INVALID_ARG/);
  });
});

describe('iconReadError', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'egon-catalog-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  let missingPath: unknown;
  beforeEach(() => {
    missingPath = failedRead(join(dir, 'nope'));
  });

  it('names a file in the way when the read reports a missing path, as Windows does', () => {
    writeFileSync(join(dir, 'generated'), 'not a folder');
    expect(iconReadError(join(dir, 'generated', 'builtin-icons.json'), missingPath).message).toContain(
      `cannot be read (${join(dir, 'generated')} is a file, not a folder)`,
    );
  });

  it('names an existing file read through trailing separators, as Windows reports it', () => {
    const file = join(dir, 'builtin-icons.json');
    writeFileSync(file, '[]');
    for (const path of [`${file}${sep}`, `${file}${sep}${sep}`]) {
      expect(iconReadError(path, missingPath).message, path).toContain(`cannot be read (${file} is a file, not a folder)`);
    }
  });

  it.runIf(process.platform !== 'win32')('treats a trailing backslash as part of the name on POSIX', () => {
    const file = join(dir, 'builtin-icons.json');
    writeFileSync(file, '[]');
    expect(iconReadError(`${file}\\`, missingPath).message).toMatch(/ is missing; /);
  });

  it('calls a path missing only when nothing is in the way', () => {
    const path = join(dir, 'generated', 'builtin-icons.json');
    expect(iconReadError(path, missingPath).message).toBe(
      `Built-in icon data ${path} is missing; run "npm run generate:icons", then "npm run build" in egon_mcp (needs the egon.io submodule).`,
    );
  });
});

describe('isFileSystemError', () => {
  it('goes by the error\'s shape, so codes like Windows\' UNKNOWN count too', () => {
    expect(isFileSystemError(failedRead(join(tmpdir(), 'egon-nope', 'x')))).toBe(true);
    expect(isFileSystemError(Object.assign(new Error('unknown error, stat'), { code: 'UNKNOWN', errno: -4094, syscall: 'stat' }))).toBe(true);
    expect(isFileSystemError(Object.assign(new Error('bad path'), { code: 'ERR_INVALID_ARG_VALUE' }))).toBe(false);
    expect(isFileSystemError(new Error('plain'))).toBe(false);
    expect(isFileSystemError('not an error')).toBe(false);
  });
});

/** The error a real read of `path` throws. */
function failedRead(path: string): unknown {
  try {
    readFileSync(path);
  } catch (error) {
    return error;
  }
  throw new Error(`${path} could be read`);
}
