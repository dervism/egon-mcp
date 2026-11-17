// Copies what the npm package needs from outside egon_mcp/ before npm pack and
// npm publish: the repository README, with relative links pointed at GitHub
// since npm shows it elsewhere, the license, and the agent skill.
//
// Usage: node scripts/pack-extras.mjs [repoDir] [packageDir]
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GITHUB = 'https://github.com/dervism/egon-mcp/blob/main/';
const packageDir = resolve(process.argv[3] ?? fileURLToPath(new URL('../', import.meta.url)));
const repoDir = resolve(process.argv[2] ?? join(packageDir, '..'));

const readme = readFileSync(join(repoDir, 'README.md'), 'utf8').replace(
  /\]\((?![a-z][a-z0-9+.-]*:|#)([^)\s]+)\)/gi,
  (_, path) => `](${GITHUB}${path.replace(/^\.\//, '')})`,
);
writeFileSync(join(packageDir, 'README.md'), readme);
cpSync(join(repoDir, 'LICENSE'), join(packageDir, 'LICENSE'));
rmSync(join(packageDir, 'skill'), { recursive: true, force: true });
cpSync(join(repoDir, 'skills', 'egon-mcp-skill'), join(packageDir, 'skill'), { recursive: true });
