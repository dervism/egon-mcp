import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sourceFiles, sourceHash } from './build-info.js';

let packageDir: string;
let src: string;

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), 'egon-hash-'));
  src = join(packageDir, 'src');
  mkdirSync(join(src, 'sub'), { recursive: true });
  writeFileSync(join(packageDir, 'tsconfig.json'), '{}');
  writeFileSync(join(packageDir, 'tsconfig.build.json'), '{}');
  writeFileSync(join(src, 'a.ts'), 'export const a = 1;');
  writeFileSync(join(src, 'sub', 'b.ts'), 'export const b = 2;');
  writeFileSync(join(src, 'a.test.ts'), 'test');
  writeFileSync(join(src, 'notes.md'), 'notes');
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
});

describe('sourceFiles', () => {
  it('lists the regular TypeScript files tsc compiles, leaving out tests, hidden files and links', () => {
    // Editors leave hidden files and dangling links, such as Emacs lock files.
    symlinkSync(join(src, 'missing.ts'), join(src, 'sub', '.#b.ts'));
    mkdirSync(join(src, '.cache'));
    writeFileSync(join(src, '.cache', 'c.ts'), 'hidden');
    writeFileSync(join(src, '.d.ts'), 'hidden');
    expect(sourceFiles(src)).toEqual(['a.ts', 'sub/b.ts']);
  });
});

describe('sourceHash', () => {
  it('ignores tests, hidden files and other files', () => {
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

  it('changes when the compiler settings change', () => {
    const before = sourceHash(packageDir);
    writeFileSync(join(packageDir, 'tsconfig.build.json'), '{ "compilerOptions": { "target": "ES2020" } }');
    expect(sourceHash(packageDir)).not.toBe(before);
  });
});
