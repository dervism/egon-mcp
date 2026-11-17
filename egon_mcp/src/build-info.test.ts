import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sourceHash } from './build-info.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'egon-hash-'));
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;');
  writeFileSync(join(dir, 'sub', 'b.ts'), 'export const b = 2;');
  writeFileSync(join(dir, 'a.test.ts'), 'test');
  writeFileSync(join(dir, 'notes.md'), 'notes');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sourceHash', () => {
  it('ignores tests and other files', () => {
    const before = sourceHash(dir);
    writeFileSync(join(dir, 'a.test.ts'), 'changed test');
    writeFileSync(join(dir, 'notes.md'), 'changed notes');
    expect(sourceHash(dir)).toBe(before);
  });

  it('changes when a source file changes or moves', () => {
    const before = sourceHash(dir);
    writeFileSync(join(dir, 'sub', 'b.ts'), 'export const b = 3;');
    const edited = sourceHash(dir);
    expect(edited).not.toBe(before);
    renameSync(join(dir, 'a.ts'), join(dir, 'c.ts'));
    expect(sourceHash(dir)).not.toBe(edited);
  });
});
