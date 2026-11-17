import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getSystemErrorMap } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILD_HINT, distState } from '../../test/dist-check.js';
import { blockingAncestor, DEFAULT_ICON_NAMES, IconCatalog, iconReadError, isArgumentError, readErrorReason } from './catalog.js';

// The permission test runs the built module in a child process; `npm test` builds first.
const distDir = fileURLToPath(new URL('../../dist/', import.meta.url));
const builtCatalog = join(distDir, 'icons', 'catalog.js');

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

  it.runIf(process.platform !== 'win32')('reports ENOTDIR, not missing, for an existing file read as a folder (POSIX)', () => {
    const file = join(dir, 'builtin-icons.json');
    writeFileSync(file, '[]');
    expect(() => IconCatalog.fromFile(new URL(`${pathToFileURL(file).href}/`))).toThrow(unreadable('ENOTDIR', 'not a directory'));
  });

  it('passes on argument errors, such as a NUL in the path, unchanged', () => {
    const url = new URL(`${pathToFileURL(join(dir, 'a')).href}%00b/builtin-icons.json`);
    let direct: unknown;
    try {
      readFileSync(url, 'utf8');
    } catch (error) {
      direct = error;
    }
    expect(direct).toBeInstanceOf(TypeError);
    expect(() => IconCatalog.fromFile(url)).toThrow(expect.objectContaining({ name: 'TypeError', code: 'ERR_INVALID_ARG_VALUE', message: (direct as Error).message }));
  });

  it('reports files the permission model hides with the path and the fix (built code)', (context) => {
    const dist = distState();
    expect(dist, `dist/ has no complete build; ${BUILD_HINT}`).not.toBe('missing');
    if (dist === 'stale') {
      context.skip(`dist/ was not built from the current sources; ${BUILD_HINT}`);
    }
    const hidden = join(dir, 'hidden', 'builtin-icons.json');
    mkdirSync(join(dir, 'hidden'));
    writeFileSync(hidden, '[]');
    const allowedButMissing = join(dir, 'open', 'builtin-icons.json');
    // Node's permission model: only dist/ and one missing file may be read.
    const script = `
      const { IconCatalog } = await import(${JSON.stringify(pathToFileURL(builtCatalog).href)});
      const attempt = (href) => {
        try {
          IconCatalog.fromFile(new URL(href));
          return 'no error';
        } catch (error) {
          return error.message;
        }
      };
      console.log(JSON.stringify([attempt(${JSON.stringify(pathToFileURL(hidden).href)}), attempt(${JSON.stringify(pathToFileURL(allowedButMissing).href)})]));`;
    // Preloads from NODE_OPTIONS (debuggers, coverage tools) would be denied under --permission.
    const { NODE_OPTIONS: _, ...env } = process.env;
    const result = spawnSync(
      process.execPath,
      ['--permission', `--allow-fs-read=${distDir}`, `--allow-fs-read=${allowedButMissing}`, '--input-type=module', '-e', script],
      { encoding: 'utf8', timeout: 20_000, env },
    );
    expect(result.status, result.stderr).toBe(0);
    const [denied, missing] = JSON.parse(result.stdout) as string[];
    expect(denied).toContain(`Built-in icon data ${hidden} cannot be read (Access to this API has been restricted`);
    // Node's own text ends in a period, which must not end up before the bracket.
    expect(denied).not.toContain('.).');
    expect(denied).toContain('then run "npm run generate:icons", then "npm run build" in egon_mcp');
    // The folder above may not be looked into either; that must not hide the "missing" advice.
    expect(missing).toBe(
      `Built-in icon data ${allowedButMissing} is missing; run "npm run generate:icons", then "npm run build" in egon_mcp (needs the egon.io submodule).`,
    );
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

  it('gives the system\'s reason for ENOTDIR when no file is in the way, naming the path once', () => {
    const path = join(dir, 'zz', 'builtin-icons.json');
    const errno = [...getSystemErrorMap()].find(([, [name]]) => name === 'ENOTDIR')?.[0];
    const notADirectory = Object.assign(new Error(`ENOTDIR: not a directory, open '${path}'`), { code: 'ENOTDIR', errno, syscall: 'open', path });
    const message = iconReadError(path, notADirectory).message;
    expect(message).toContain('cannot be read (ENOTDIR: not a directory). Fix what stops it from being read');
    expect(message.split(path)).toHaveLength(2);
  });

  it('reports data and environment errors that carry no system error number by their message', () => {
    const path = join(dir, 'builtin-icons.json');
    const tooLong = Object.assign(new Error('Cannot create a string longer than 0x1fffffe8 characters'), { code: 'ERR_STRING_TOO_LONG' });
    expect(iconReadError(path, tooLong).message).toContain('cannot be read (Cannot create a string longer than 0x1fffffe8 characters)');
  });

  it('keeps the original error as the cause', () => {
    const path = join(dir, 'zz', 'builtin-icons.json');
    expect(iconReadError(path, missingPath).cause).toBe(missingPath);
    const denied = Object.assign(new Error('Access to this API has been restricted.'), { code: 'ERR_ACCESS_DENIED' });
    expect(iconReadError(path, denied).cause).toBe(denied);
  });

  it('calls a path missing only when nothing is in the way', () => {
    const path = join(dir, 'generated', 'builtin-icons.json');
    expect(iconReadError(path, missingPath).message).toBe(
      `Built-in icon data ${path} is missing; run "npm run generate:icons", then "npm run build" in egon_mcp (needs the egon.io submodule).`,
    );
  });
});

describe('isArgumentError', () => {
  it('singles out errors in the call itself, which no change to the data can fix', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-catalog-'));
    try {
      expect(isArgumentError(failedRead(join(dir, 'a\0b')))).toBe(true);
      expect(isArgumentError(failedRead(join(dir, 'nope')))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // ERR_ACCESS_DENIED, a plain Error, is covered end to end by the permission test above.
    expect(isArgumentError('not an error')).toBe(false);
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
