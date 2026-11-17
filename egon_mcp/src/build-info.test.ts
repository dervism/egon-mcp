import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILD_INFO_FILE, copyAssets, finishBuildRecord, PENDING_BUILD_INFO_FILE, sourceFiles, sourceHash, startBuildRecord } from './build-info.js';

// Creating links on Windows needs extra rights, so the link tests run elsewhere only.
const links = process.platform !== 'win32';

let packageDir: string;
let src: string;
let outside: string;

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), 'egon-hash-'));
  outside = mkdtempSync(join(tmpdir(), 'egon-hash-outside-'));
  src = join(packageDir, 'src');
  mkdirSync(join(src, 'sub'), { recursive: true });
  mkdirSync(join(src, 'icons', 'generated'), { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), '{ "type": "module" }');
  writeFileSync(join(packageDir, 'tsconfig.json'), '{}');
  writeFileSync(join(packageDir, 'tsconfig.build.json'), '{}');
  writeFileSync(join(src, 'a.ts'), 'export const a = 1;');
  writeFileSync(join(src, 'sub', 'b.ts'), 'export const b = 2;');
  writeFileSync(join(src, 'a.test.ts'), 'test');
  writeFileSync(join(src, 'notes.md'), 'notes');
  writeFileSync(join(src, 'icons', 'generated', 'builtin-icons.json'), '[]');
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('sourceFiles', () => {
  it.runIf(links)('lists the TypeScript files tsc compiles, leaving out tests, hidden files and dangling links', () => {
    // Editors leave hidden files and dangling links, such as Emacs lock links.
    symlinkSync(join(src, 'missing.ts'), join(src, 'sub', '.#b.ts'));
    symlinkSync(join(src, 'missing.ts'), join(src, 'broken.ts'));
    mkdirSync(join(src, '.cache'));
    writeFileSync(join(src, '.cache', 'c.ts'), 'hidden');
    writeFileSync(join(src, '.d.ts'), 'hidden');
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

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)('skips folders it cannot read, as tsc does', () => {
    mkdirSync(join(src, 'locked'));
    writeFileSync(join(src, 'locked', 'secret.ts'), 'export const s = 1;');
    chmodSync(join(src, 'locked'), 0o000);
    try {
      expect(sourceFiles(src)).toEqual(['a.ts', 'sub/b.ts']);
    } finally {
      chmodSync(join(src, 'locked'), 0o755);
    }
  });
});

describe('sourceHash', () => {
  it.runIf(links)('ignores tests, hidden files and other files', () => {
    const before = sourceHash(packageDir);
    writeFileSync(join(src, 'a.test.ts'), 'changed test');
    writeFileSync(join(src, 'notes.md'), 'changed notes');
    symlinkSync(join(src, 'missing.ts'), join(src, '.#a.ts'));
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

  it('changes with every other build input: both tsconfig files, package.json, the lockfile and the generated icons', () => {
    const edits: [string, string][] = [
      ['tsconfig.json', '{ "compilerOptions": { "strict": false } }'],
      ['tsconfig.build.json', '{ "compilerOptions": { "target": "ES2020" } }'],
      ['package.json', '{ "type": "commonjs" }'],
      // The lockfile pins the TypeScript compiler.
      ['package-lock.json', '{ "packages": { "node_modules/typescript": { "version": "7.1.0" } } }'],
      [join('src', 'icons', 'generated', 'builtin-icons.json'), '[{ "name": "New" }]'],
    ];
    for (const [file, content] of edits) {
      const before = sourceHash(packageDir);
      writeFileSync(join(packageDir, file), content);
      expect(sourceHash(packageDir), file).not.toBe(before);
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
  it.runIf(links)('copies the asset folders as they are hashed: hidden files left out, links as files', () => {
    const generated = join(src, 'icons', 'generated');
    writeFileSync(join(generated, '.DS_Store'), 'finder');
    writeFileSync(join(outside, 'extra.json'), '{}');
    symlinkSync(join(outside, 'extra.json'), join(generated, 'extra.json'));
    copyAssets(packageDir);
    const copied = join(packageDir, 'dist', 'icons', 'generated');
    expect(existsSync(join(copied, 'builtin-icons.json'))).toBe(true);
    expect(existsSync(join(copied, '.DS_Store'))).toBe(false);
    expect(lstatSync(join(copied, 'extra.json')).isSymbolicLink()).toBe(false);
  });
});

describe('build record', () => {
  const dist = () => join(packageDir, 'dist');
  const record = () => join(dist(), BUILD_INFO_FILE);

  it('only exists once a build finished, and then names the sources it started from', () => {
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

  it('forgets the last record when a new build starts, so a failed build leaves none', () => {
    startBuildRecord(packageDir);
    finishBuildRecord(packageDir);
    startBuildRecord(packageDir);
    expect(existsSync(record())).toBe(false);
  });

  it('refuses to finish a build that was never started', () => {
    mkdirSync(dist());
    expect(() => finishBuildRecord(packageDir)).toThrow();
    expect(existsSync(record())).toBe(false);
  });
});
