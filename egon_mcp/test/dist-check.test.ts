import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILD_INFO_FILE, sourceHash } from '../src/build-info.js';
import { distState } from './dist-check.js';

let packageDir: string;

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), 'egon-dist-'));
  mkdirSync(join(packageDir, 'src'));
  mkdirSync(join(packageDir, 'dist'));
  writeFileSync(join(packageDir, 'tsconfig.json'), '{}');
  writeFileSync(join(packageDir, 'tsconfig.build.json'), '{}');
  writeFileSync(join(packageDir, 'src', 'a.ts'), 'export const a = 1;');
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
});

const record = (content: string) => writeFileSync(join(packageDir, 'dist', BUILD_INFO_FILE), content);

describe('distState', () => {
  it('is missing without a complete build record', () => {
    expect(distState(packageDir)).toBe('missing');
    record('not json');
    expect(distState(packageDir)).toBe('missing');
  });

  it('is current when the record matches the sources, and stale after an edit', () => {
    record(JSON.stringify({ sourceHash: sourceHash(packageDir) }));
    expect(distState(packageDir)).toBe('current');
    writeFileSync(join(packageDir, 'src', 'a.ts'), 'export const a = 2;');
    expect(distState(packageDir)).toBe('stale');
  });
});
