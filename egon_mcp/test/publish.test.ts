import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/publish.mjs', import.meta.url));
let root: string;
let dir: string;
let log: string;

/** git without the user's identity, signing or hook settings. */
const git = (cwd: string, ...args: string[]) =>
  spawnSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd, encoding: 'utf8' },
  );

/** Runs the release in the scratch package with a fake npm that logs its calls and packs an empty tarball. */
const release = (args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['scripts/publish.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, npm_execpath: join(root, 'npm', 'bin', 'npm-cli.js'), FAKE_NPM_LOG: log, npm_config_dry_run: '', ...env },
  });
const calls = () =>
  existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { args: string[]; dryRun: string })
    : [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'egon-publish-'));
  dir = join(root, 'package');
  log = join(root, 'npm.log');
  mkdirSync(join(root, 'npm', 'bin'), { recursive: true });
  writeFileSync(
    join(root, 'npm', 'bin', 'npm-cli.js'),
    `const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ args, dryRun: process.env.npm_config_dry_run ?? '' }) + '\\n');
if (args[0] === 'pack') fs.writeFileSync('egon-mcp-9.9.9.tgz', 'tarball');
`,
  );
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(script, join(dir, 'scripts', 'publish.mjs'));
  writeFileSync(join(dir, 'package.json'), '{ "name": "egon-mcp", "version": "9.9.9" }');
  writeFileSync(join(dir, '.gitignore'), '*.tgz\n');
  git(root, 'init', '-q', '--bare', 'origin.git');
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', join(root, 'origin.git'));
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'Start');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('npm run release', () => {
  it('wants a clean working tree', () => {
    writeFileSync(join(dir, 'notes.txt'), 'draft');
    const result = release();
    expect([result.status, result.stderr]).toEqual([1, expect.stringMatching(/Commit or stash/)]);
  });

  it('wants the version tag on the current commit', () => {
    expect(release().stderr).toMatch(/Tag v9\.9\.9 is missing: git tag v9\.9\.9/);
    git(dir, 'tag', 'v9.9.9');
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'Later');
    expect(release().stderr).toMatch(/Tag v9\.9\.9 points at another commit than HEAD/);
    expect(calls()).toEqual([]);
  });

  it('wants the same tag on GitHub, so the README on npm links to the published code', () => {
    git(dir, 'tag', 'v9.9.9');
    expect(release().stderr).toMatch(/git push origin v9\.9\.9/);
    git(dir, 'push', '-q', 'origin', 'v9.9.9');
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'Later');
    git(dir, 'tag', '-f', 'v9.9.9');
    expect(release().stderr).toMatch(/v9\.9\.9 on GitHub points at another commit/);
    expect(calls()).toEqual([]);
  });

  it('tests, packs with lifecycle scripts on, publishes the tarball with the extra arguments, and prints its SHA-256', () => {
    git(dir, 'tag', 'v9.9.9');
    git(dir, 'push', '-q', 'origin', 'v9.9.9');
    const result = release(['--otp', '123456']);
    expect(result.status, result.stderr).toBe(0);
    expect(calls().map((call) => call.args)).toEqual([
      ['test', '--ignore-scripts=false'],
      ['pack', '--ignore-scripts=false'],
      ['publish', 'egon-mcp-9.9.9.tgz', '--otp', '123456'],
    ]);
    // sha256 of the text "tarball"
    expect(result.stdout).toMatch(/Published egon-mcp@9\.9\.9[\s\S]*db4b4d0d1cb480bf9aeea253771c00febe627f236765fa37d6a5614f079a3aa0/);
  });

  it('tries a release before the tag is on GitHub with --dry-run, given either way', () => {
    git(dir, 'tag', 'v9.9.9');
    for (const [args, env] of [
      [['--dry-run'], {}],
      [[], { npm_config_dry_run: 'true' }],
    ] as const) {
      rmSync(log, { force: true });
      const result = release([...args], env);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toMatch(/not on GitHub yet/);
      expect(result.stdout).toMatch(/Checked egon-mcp@9\.9\.9/);
      // npm pack still writes the tarball; only publish runs dry.
      expect(calls().map((call) => [call.args[0], call.dryRun])).toEqual([
        ['test', ''],
        ['pack', ''],
        ['publish', ''],
      ]);
      expect(calls().at(-1)?.args).toContain('--dry-run');
    }
  });

  it('names the step that failed', () => {
    git(dir, 'tag', 'v9.9.9');
    git(dir, 'push', '-q', 'origin', 'v9.9.9');
    writeFileSync(join(root, 'npm', 'bin', 'npm-cli.js'), "if (process.argv[2] === 'test') process.exit(1);\n");
    const result = release();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/npm test failed/);
    expect(result.stderr).not.toMatch(/at .*publish\.mjs/);
  });
});
