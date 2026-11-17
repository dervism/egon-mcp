import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SERVER_VERSION } from '../src/server/server.js';
import { BUILD_HINT, distState } from './dist-check.js';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
  version: string;
  private?: boolean;
  main?: string;
  files: string[];
  bin: Record<string, string>;
  scripts: Record<string, string>;
  repository?: { url?: string };
};

const packExtras = (repo: string, target: string) =>
  spawnSync(process.execPath, ['scripts/pack-extras.mjs', repo, target], { cwd: packageDir, encoding: 'utf8', timeout: 20_000 });

describe('npm package', () => {
  it('reports the version of package.json', () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it('can be published with the build, the skill and the egon-mcp command, and does nothing on import', () => {
    expect(pkg.private).toBeUndefined();
    expect(pkg.main).toBeUndefined();
    expect(pkg.bin).toEqual({ 'egon-mcp': 'dist/index.js' });
    // A clean build, so files of deleted sources do not ship.
    expect(pkg.scripts['prepack']).toMatch(/rmSync\('dist'.*&& npm run build && node scripts\/pack-extras\.mjs$/);
    expect(pkg.repository?.url).toContain('github.com/dervism/egon-mcp');
  });

  describe('built', () => {
    beforeEach((context) => {
      const dist = distState();
      expect(dist, `dist/ has no complete build; ${BUILD_HINT}`).not.toBe('missing');
      if (dist === 'stale') {
        context.skip(`dist/ was not built from the current sources; ${BUILD_HINT}`);
      }
    });

    it('packs the build, the icons, the skill, the README and the license, and nothing else', () => {
      expect(packExtras(join(packageDir, '..'), packageDir).status).toBe(0);
      const npm = process.env['npm_execpath'];
      const result = npm
        ? spawnSync(process.execPath, [npm, 'pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageDir, encoding: 'utf8', timeout: 60_000 })
        : spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageDir, encoding: 'utf8', timeout: 60_000 });
      expect(result.status, result.stderr).toBe(0);
      const files = (JSON.parse(result.stdout) as { files: { path: string }[] }[])[0]?.files.map((file) => file.path) ?? [];
      for (const path of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/icons/generated/builtin-icons.json', 'skill/SKILL.md', 'skill/references/tools.md']) {
        expect(files).toContain(path);
      }
      expect(files.filter((path) => /^(src|test|scripts|dist\/docs)\/|\.map$|\.tgz$/.test(path))).toEqual([]);
      expect(readFileSync(join(packageDir, 'dist', 'index.js'), 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
    });

    it('prints the version and the help on stdout', () => {
      const run = (flag: string) => spawnSync(process.execPath, ['dist/index.js', flag], { cwd: packageDir, encoding: 'utf8', timeout: 20_000 });
      expect(run('--version').stdout).toBe(`${pkg.version}\n`);
      expect(run('--help').stdout).toMatch(/^Usage: egon-mcp/);
    });
  });
});

describe('pack-extras', () => {
  let repo: string;
  const target = () => join(repo, 'egon_mcp');

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'egon-pack-'));
    mkdirSync(target());
    writeFileSync(join(target(), 'package.json'), '{ "version": "9.9.9" }');
    mkdirSync(join(repo, 'skills', 'egon-mcp-skill', 'references'), { recursive: true });
    writeFileSync(join(repo, 'LICENSE'), 'GPL text');
    writeFileSync(join(repo, 'skills', 'egon-mcp-skill', 'SKILL.md'), '# Skill');
    writeFileSync(join(repo, 'skills', 'egon-mcp-skill', 'references', 'tools.md'), '# Tools');
    writeFileSync(
      join(repo, 'README.md'),
      [
        'See [ADR 2](docs/adr/0002.md), [the skill](./skills/egon-mcp-skill/SKILL.md), [LICENSE](LICENSE), [Egon](https://egon.io) and [below](#install).',
        'Also [titled](docs/t.md "Title") and [rooted](/docs/r.md).',
        '',
        '[ref]: docs/ref.md',
        '[web]: https://egon.io',
        '',
      ].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('copies the README with links to the release on GitHub, the license and the skill into the package', () => {
    expect(packExtras(repo, target()).status).toBe(0);
    const readme = readFileSync(join(target(), 'README.md'), 'utf8');
    const base = 'https://github.com/dervism/egon-mcp/blob/v9.9.9/';
    expect(readme).toContain(`[ADR 2](${base}docs/adr/0002.md)`);
    expect(readme).toContain(`[the skill](${base}skills/egon-mcp-skill/SKILL.md)`);
    expect(readme).toContain(`[LICENSE](${base}LICENSE)`);
    expect(readme).toContain('[Egon](https://egon.io)');
    expect(readme).toContain('[below](#install)');
    expect(readme).toContain(`[titled](${base}docs/t.md "Title")`);
    expect(readme).toContain(`[rooted](${base}docs/r.md)`);
    expect(readme).toContain(`[ref]: ${base}docs/ref.md`);
    expect(readme).toContain('[web]: https://egon.io');
    expect(readFileSync(join(target(), 'LICENSE'), 'utf8')).toBe('GPL text');
    expect(readFileSync(join(target(), 'skill', 'references', 'tools.md'), 'utf8')).toBe('# Tools');
  });

  it('replaces a skill copied before, so removed files do not linger', () => {
    mkdirSync(join(target(), 'skill'));
    writeFileSync(join(target(), 'skill', 'old.md'), 'gone');
    expect(packExtras(repo, target()).status).toBe(0);
    expect(existsSync(join(target(), 'skill', 'old.md'))).toBe(false);
  });
});
