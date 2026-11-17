import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/publish.mjs', import.meta.url));
let dir: string;

/** git in the scratch package, without the user's signing or identity settings. */
const git = (...args: string[]) =>
  spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
const release = () => spawnSync(process.execPath, ['scripts/publish.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8', timeout: 20_000 });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'egon-publish-'));
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(script, join(dir, 'scripts', 'publish.mjs'));
  writeFileSync(join(dir, 'package.json'), '{ "name": "egon-mcp", "version": "9.9.9" }');
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'Start');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('npm run release', () => {
  it('wants the version tag on the current commit', () => {
    const result = release();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Tag v9\.9\.9 must point at HEAD/);
  });

  it('wants the tag on GitHub, so the README on npm can link to it', () => {
    git('tag', 'v9.9.9');
    const result = release();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/git push origin v9\.9\.9/);
  });

  it('wants a clean working tree', () => {
    git('tag', 'v9.9.9');
    writeFileSync(join(dir, 'notes.txt'), 'draft');
    const result = release();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Commit or stash/);
  });
});
