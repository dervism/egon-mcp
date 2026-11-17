import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
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
    expect(pkg.scripts['prepack']).toBe('node scripts/clean-dist.mjs && npm run build && node scripts/pack-extras.mjs');
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
      // The npm that runs the tests, else the one on the PATH (npm.cmd on Windows).
      const npm = process.env['npm_execpath'];
      const args = ['pack', '--dry-run', '--json', '--ignore-scripts'];
      const options = { cwd: packageDir, encoding: 'utf8' as const, timeout: 60_000 };
      const result =
        npm && /npm/.test(npm)
          ? spawnSync(process.execPath, [npm, ...args], options)
          : spawnSync('npm', args, { ...options, shell: process.platform === 'win32' });
      expect(result.status, result.stderr).toBe(0);
      const files = (JSON.parse(result.stdout) as { files: { path: string }[] }[])[0]?.files.map((file) => file.path) ?? [];
      for (const path of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/icons/generated/builtin-icons.json', 'skill/SKILL.md', 'skill/references/tools.md']) {
        expect(files).toContain(path);
      }
      expect(files.filter((path) => /^(src|test|scripts|dist\/docs)\/|\.map$|\.tgz$/.test(path))).toEqual([]);
      expect(readFileSync(join(packageDir, 'dist', 'index.js'), 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
      // Every file a packed module imports is packed too, and none points at a source map.
      for (const path of files.filter((file) => file.endsWith('.js'))) {
        const code = readFileSync(join(packageDir, path), 'utf8');
        expect(code, path).not.toMatch(/sourceMappingURL/);
        for (const [, target] of code.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
          expect(files, `${path} imports ${target}`).toContain(posix.join(posix.dirname(path), target as string));
        }
      }
    });

    it('prints the version and the help on stdout', () => {
      const run = (flag: string) => spawnSync(process.execPath, ['dist/index.js', flag], { cwd: packageDir, encoding: 'utf8', timeout: 20_000 });
      const version = run('--version');
      const help = run('--help');
      expect([version.status, version.stdout, version.stderr]).toEqual([0, `${pkg.version}\n`, '']);
      expect([help.status, help.stderr]).toEqual([0, '']);
      expect(help.stdout).toMatch(/^Usage: egon-mcp/);
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
        '[angle]: <docs/b.md>',
        '[^1]: Footnote text here.',
        '',
        "Single [quoted](docs/q.md 'Q'), ![logo](docs/logo.png) and a [cdn](//cdn.example.com/x.js).",
        '',
        '```markdown',
        '[in code](docs/code.md)',
        '```',
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
    expect(readme).toContain(`[angle]: <${base}docs/b.md>`);
    expect(readme).toContain('[^1]: Footnote text here.');
    expect(readme).toContain(`[quoted](${base}docs/q.md 'Q')`);
    expect(readme).toContain('![logo](https://github.com/dervism/egon-mcp/raw/v9.9.9/docs/logo.png)');
    expect(readme).toContain('[cdn](//cdn.example.com/x.js)');
    expect(readme).toContain('[in code](docs/code.md)');
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

describe('clean-dist', () => {
  it('empties dist/ so a build leaves no files of deleted sources', () => {
    const dir = mkdtempSync(join(tmpdir(), 'egon-clean-'));
    try {
      mkdirSync(join(dir, 'scripts'));
      mkdirSync(join(dir, 'dist', 'story'), { recursive: true });
      writeFileSync(join(dir, 'dist', 'story', 'stale.js'), 'old');
      copyFileSync(join(packageDir, 'scripts', 'clean-dist.mjs'), join(dir, 'scripts', 'clean-dist.mjs'));
      expect(spawnSync(process.execPath, ['scripts/clean-dist.mjs'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
      expect(existsSync(join(dir, 'dist'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
