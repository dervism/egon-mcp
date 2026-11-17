import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SERVER_VERSION } from '../src/server/server.js';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
  version: string;
  private?: boolean;
  files: string[];
  bin: Record<string, string>;
  scripts: Record<string, string>;
  repository?: { url?: string };
};

describe('npm package', () => {
  it('reports the version of package.json', () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it('can be published with the build, the skill and the egon-mcp command', () => {
    expect(pkg.private).toBeUndefined();
    expect(pkg.files).toEqual(['dist', 'skill']);
    expect(pkg.bin).toEqual({ 'egon-mcp': 'dist/index.js' });
    expect(pkg.scripts['prepack']).toMatch(/npm run build && node scripts\/pack-extras\.mjs/);
    expect(pkg.repository?.url).toContain('github.com/dervism/egon-mcp');
  });
});

describe('pack-extras', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'egon-pack-'));
    mkdirSync(join(repo, 'egon_mcp'));
    mkdirSync(join(repo, 'skills', 'egon-mcp-skill', 'references'), { recursive: true });
    writeFileSync(join(repo, 'LICENSE'), 'GPL text');
    writeFileSync(join(repo, 'skills', 'egon-mcp-skill', 'SKILL.md'), '# Skill');
    writeFileSync(join(repo, 'skills', 'egon-mcp-skill', 'references', 'tools.md'), '# Tools');
    writeFileSync(
      join(repo, 'README.md'),
      'See [ADR 2](docs/adr/0002.md), [the skill](skills/egon-mcp-skill/SKILL.md), [LICENSE](LICENSE), [Egon](https://egon.io) and [below](#install).\n',
    );
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  const pack = () =>
    spawnSync(process.execPath, ['scripts/pack-extras.mjs', repo, join(repo, 'egon_mcp')], { cwd: packageDir, encoding: 'utf8', timeout: 20_000 });

  it('copies the README with links to GitHub, the license and the skill into the package', () => {
    expect(pack().status).toBe(0);
    const readme = readFileSync(join(repo, 'egon_mcp', 'README.md'), 'utf8');
    expect(readme).toContain('[ADR 2](https://github.com/dervism/egon-mcp/blob/main/docs/adr/0002.md)');
    expect(readme).toContain('[the skill](https://github.com/dervism/egon-mcp/blob/main/skills/egon-mcp-skill/SKILL.md)');
    expect(readme).toContain('[LICENSE](https://github.com/dervism/egon-mcp/blob/main/LICENSE)');
    expect(readme).toContain('[Egon](https://egon.io)');
    expect(readme).toContain('[below](#install)');
    expect(readFileSync(join(repo, 'egon_mcp', 'LICENSE'), 'utf8')).toBe('GPL text');
    expect(readFileSync(join(repo, 'egon_mcp', 'skill', 'references', 'tools.md'), 'utf8')).toBe('# Tools');
  });

  it('replaces a skill copied before, so removed files do not linger', () => {
    mkdirSync(join(repo, 'egon_mcp', 'skill'));
    writeFileSync(join(repo, 'egon_mcp', 'skill', 'old.md'), 'gone');
    expect(pack().status).toBe(0);
    expect(existsSync(join(repo, 'egon_mcp', 'skill', 'old.md'))).toBe(false);
  });
});
