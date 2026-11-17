import { chmodSync, type Dirent, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILD_INFO_FILE,
  completeBuild,
  copyAssets,
  finishBuildRecord,
  PENDING_BUILD_INFO_FILE,
  sourceFiles,
  sourceHash,
  startBuildRecord,
} from './build-info.js';

const ICONS = '[{ "name": "Person", "svg": "<svg/>", "keywords": [] }]';

// Creating links on Windows needs extra rights, so the link checks run elsewhere only.
const links = process.platform !== 'win32';

let packageDir: string;
let src: string;
let generated: string;
let outside: string;

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), 'egon-hash-'));
  outside = mkdtempSync(join(tmpdir(), 'egon-hash-outside-'));
  src = join(packageDir, 'src');
  generated = join(src, 'icons', 'generated');
  mkdirSync(join(src, 'sub'), { recursive: true });
  mkdirSync(generated, { recursive: true });
  mkdirSync(join(packageDir, 'node_modules', 'typescript'), { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), '{ "type": "module" }');
  writeFileSync(join(packageDir, 'tsconfig.json'), '{}');
  writeFileSync(join(packageDir, 'tsconfig.build.json'), '{}');
  writeFileSync(join(packageDir, 'node_modules', 'typescript', 'package.json'), '{ "version": "7.0.2" }');
  writeFileSync(join(src, 'a.ts'), 'export const a = 1;');
  writeFileSync(join(src, 'sub', 'b.ts'), 'export const b = 2;');
  writeFileSync(join(src, 'a.test.ts'), 'test');
  writeFileSync(join(src, 'notes.md'), 'notes');
  writeFileSync(join(generated, 'builtin-icons.json'), ICONS);
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('sourceFiles', () => {
  it('lists the TypeScript files tsc compiles, leaving out tests and hidden files', () => {
    mkdirSync(join(src, '.cache'));
    writeFileSync(join(src, '.cache', 'c.ts'), 'hidden');
    writeFileSync(join(src, '.d.ts'), 'hidden');
    expect(sourceFiles(src)).toEqual(['a.ts', 'sub/b.ts']);
  });

  it.runIf(links)('leaves out dangling links, such as Emacs lock links', () => {
    symlinkSync(join(src, 'missing.ts'), join(src, 'sub', '.#b.ts'));
    symlinkSync(join(src, 'missing.ts'), join(src, 'broken.ts'));
    expect(sourceFiles(src)).toEqual(['a.ts', 'sub/b.ts']);
  });

  it.runIf(links)('follows links to files and folders, as tsc does', () => {
    writeFileSync(join(outside, 'linked.ts'), 'export const linked = 1;');
    mkdirSync(join(outside, 'folder'));
    writeFileSync(join(outside, 'folder', 'deep.ts'), 'export const deep = 1;');
    symlinkSync(join(outside, 'linked.ts'), join(src, 'linked.ts'));
    symlinkSync(join(outside, 'folder'), join(src, 'folder'));
    // A link back up must not loop forever.
    symlinkSync(src, join(src, 'sub', 'loop'));
    expect(sourceFiles(src)).toEqual(['a.ts', 'folder/deep.ts', 'linked.ts', 'sub/b.ts']);
  });

  it('skips package folders, as tsc does', () => {
    for (const folder of ['node_modules', 'bower_components', 'jspm_packages']) {
      mkdirSync(join(src, 'sub', folder, 'pkg'), { recursive: true });
      writeFileSync(join(src, 'sub', folder, 'pkg', 'n.ts'), 'export const n = 1;');
    }
    expect(sourceFiles(src)).toEqual(['a.ts', 'sub/b.ts']);
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)('skips folders below it that it cannot read, as tsc does', () => {
    mkdirSync(join(src, 'locked'));
    writeFileSync(join(src, 'locked', 'secret.ts'), 'export const s = 1;');
    chmodSync(join(src, 'locked'), 0o000);
    try {
      expect(sourceFiles(src)).toEqual(['a.ts', 'sub/b.ts']);
    } finally {
      chmodSync(join(src, 'locked'), 0o755);
    }
  });

  it('fails for a source folder that does not exist', () => {
    expect(() => sourceFiles(join(packageDir, 'nope'))).toThrow(/ENOENT/);
  });
});

describe('sourceHash', () => {
  it('ignores tests, hidden files and other files', () => {
    const before = sourceHash(packageDir);
    writeFileSync(join(src, 'a.test.ts'), 'changed test');
    writeFileSync(join(src, 'notes.md'), 'changed notes');
    writeFileSync(join(src, '.hidden.ts'), 'hidden');
    expect(sourceHash(packageDir)).toBe(before);
  });

  it.runIf(links)('ignores dangling links', () => {
    const before = sourceHash(packageDir);
    symlinkSync(join(src, 'missing.ts'), join(src, '.#a.ts'));
    symlinkSync(join(src, 'missing.ts'), join(src, 'broken.ts'));
    expect(sourceHash(packageDir)).toBe(before);
  });

  it('changes when a source file changes or moves', () => {
    const before = sourceHash(packageDir);
    writeFileSync(join(src, 'sub', 'b.ts'), 'export const b = 3;');
    const edited = sourceHash(packageDir);
    expect(edited).not.toBe(before);
    renameSync(join(src, 'a.ts'), join(src, 'c.ts'));
    expect(sourceHash(packageDir)).not.toBe(edited);
  });

  it('changes with every other build input: settings, the installed compiler and the assets', () => {
    const edits: [string, string][] = [
      ['tsconfig.json', '{ "compilerOptions": { "strict": false } }'],
      ['tsconfig.build.json', '{ "compilerOptions": { "target": "ES2020" } }'],
      ['package.json', '{ "type": "commonjs" }'],
      [join('node_modules', 'typescript', 'package.json'), '{ "version": "7.1.0" }'],
      [join('src', 'icons', 'generated', 'builtin-icons.json'), '[{ "name": "New" }]'],
    ];
    for (const [file, content] of edits) {
      const before = sourceHash(packageDir);
      writeFileSync(join(packageDir, file), content);
      expect(sourceHash(packageDir), file).not.toBe(before);
    }
  });

  it('tells a missing settings file apart from any content', () => {
    rmSync(join(packageDir, 'package.json'));
    const missing = sourceHash(packageDir);
    for (const content of ['', 'missing', '-', '\0']) {
      writeFileSync(join(packageDir, 'package.json'), content);
      expect(sourceHash(packageDir), JSON.stringify(content)).not.toBe(missing);
    }
  });

  it.runIf(links)('changes when a linked source changes', () => {
    writeFileSync(join(outside, 'linked.ts'), 'export const linked = 1;');
    symlinkSync(join(outside, 'linked.ts'), join(src, 'linked.ts'));
    const before = sourceHash(packageDir);
    writeFileSync(join(outside, 'linked.ts'), 'export const linked = 2;');
    expect(sourceHash(packageDir)).not.toBe(before);
  });
});

describe('copyAssets', () => {
  const copied = () => join(packageDir, 'dist', 'icons', 'generated');
  const copiedFiles = () => readdirRecursive(copied());

  it('copies exactly the asset files the hash covers, into a cleared folder', () => {
    writeFileSync(join(generated, '.DS_Store'), 'finder');
    mkdirSync(join(generated, 'node_modules'));
    writeFileSync(join(generated, 'node_modules', 'x.json'), '{}');
    mkdirSync(join(packageDir, 'dist', 'icons', 'generated'), { recursive: true });
    writeFileSync(join(copied(), 'old.json'), 'left from an earlier build');
    copyAssets(packageDir);
    expect(copiedFiles()).toEqual(['builtin-icons.json']);
  });

  it('fails when a file the server needs is missing, even if its folder is there', () => {
    const hint = /src\/icons\/generated\/builtin-icons\.json is missing; run "npm run generate:icons", then "npm run build"/;
    rmSync(join(generated, 'builtin-icons.json'));
    writeFileSync(join(generated, '.DS_Store'), 'finder');
    expect(() => copyAssets(packageDir)).toThrow(hint);
    rmSync(generated, { recursive: true });
    expect(() => copyAssets(packageDir)).toThrow(hint);
  });

  it('fails when a required file holds no usable data, such as an empty or cut-off icon list', () => {
    for (const content of ['', '[{ "name": "Person"', '[]', '{}', '[{ "name": "Person" }]']) {
      writeFileSync(join(generated, 'builtin-icons.json'), content);
      expect(() => copyAssets(packageDir), JSON.stringify(content)).toThrow(
        /src\/icons\/generated\/builtin-icons\.json is not usable; run "npm run generate:icons", then "npm run build"/,
      );
    }
  });

  it.runIf(links)('copies links as the files they point to and skips dangling ones', () => {
    writeFileSync(join(outside, 'extra.json'), '{}');
    symlinkSync(join(outside, 'extra.json'), join(generated, 'extra.json'));
    symlinkSync(join(outside, 'missing.json'), join(generated, 'broken.json'));
    copyAssets(packageDir);
    expect(copiedFiles()).toEqual(['builtin-icons.json', 'extra.json']);
    expect(lstatSync(join(copied(), 'extra.json')).isSymbolicLink()).toBe(false);
  });
});

describe('build record', () => {
  const dist = () => join(packageDir, 'dist');
  const record = () => join(dist(), BUILD_INFO_FILE);

  it('only exists once a build finished, and then names the inputs it started from', () => {
    startBuildRecord(packageDir);
    expect(existsSync(record())).toBe(false);
    expect(existsSync(join(dist(), PENDING_BUILD_INFO_FILE))).toBe(true);
    const started = sourceHash(packageDir);
    // A source saved while tsc runs is not part of this build.
    writeFileSync(join(src, 'a.ts'), 'export const a = 2;');
    finishBuildRecord(packageDir);
    expect(JSON.parse(readFileSync(record(), 'utf8'))).toEqual({ sourceHash: started });
    expect(existsSync(join(dist(), PENDING_BUILD_INFO_FILE))).toBe(false);
  });

  it('forgets the last record and the copied assets when a new build starts', () => {
    startBuildRecord(packageDir);
    copyAssets(packageDir);
    finishBuildRecord(packageDir);
    startBuildRecord(packageDir);
    expect(existsSync(record())).toBe(false);
    // So a build that never copies the assets cannot pass on an earlier copy.
    expect(existsSync(join(dist(), 'icons', 'generated'))).toBe(false);
  });

  it('completes a build by copying the assets first, so missing ones leave no record', () => {
    startBuildRecord(packageDir);
    rmSync(join(generated, 'builtin-icons.json'));
    expect(() => completeBuild(packageDir)).toThrow(/builtin-icons\.json is missing/);
    expect(existsSync(record())).toBe(false);
    writeFileSync(join(generated, 'builtin-icons.json'), ICONS);
    completeBuild(packageDir);
    expect(existsSync(record())).toBe(true);
    expect(existsSync(join(dist(), 'icons', 'generated', 'builtin-icons.json'))).toBe(true);
  });

  it('refuses to finish a build that was never started', () => {
    mkdirSync(dist());
    expect(() => finishBuildRecord(packageDir)).toThrow();
    expect(existsSync(record())).toBe(false);
  });
});

function readdirRecursive(dir: string): string[] {
  return (readdirSync(dir, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}
