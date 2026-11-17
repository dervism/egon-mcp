// Copies what the npm package needs from outside egon_mcp/ before npm pack and
// npm publish: the repository README, with relative links pointed at this
// version's tag on GitHub since npm shows it elsewhere, the license, and the
// agent skill.
//
// Usage: node scripts/pack-extras.mjs [repoDir] [packageDir]
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(process.argv[3] ?? fileURLToPath(new URL('../', import.meta.url)));
const repoDir = resolve(process.argv[2] ?? join(packageDir, '..'));
const { version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const base = `https://github.com/dervism/egon-mcp/blob/v${version}/`;

// A link target with no scheme and no #anchor is a path in the repository.
const local = '(?![a-z][a-z0-9+.-]*:|#)';
const absolute = (path) => base + path.replace(/^\.?\//, '');
const readme = readFileSync(join(repoDir, 'README.md'), 'utf8')
  .replace(new RegExp(`\\]\\(${local}([^)\\s]+)((?:\\s+"[^"]*")?)\\)`, 'gi'), (_, path, title) => `](${absolute(path)}${title})`)
  .replace(new RegExp(`^(\\s*\\[[^\\]]+\\]:\\s*)${local}(\\S+)`, 'gim'), (_, label, path) => `${label}${absolute(path)}`);
writeFileSync(join(packageDir, 'README.md'), readme);
cpSync(join(repoDir, 'LICENSE'), join(packageDir, 'LICENSE'));
rmSync(join(packageDir, 'skill'), { recursive: true, force: true });
cpSync(join(repoDir, 'skills', 'egon-mcp-skill'), join(packageDir, 'skill'), { recursive: true });
