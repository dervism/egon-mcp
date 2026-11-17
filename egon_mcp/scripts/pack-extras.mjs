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
const repo = 'https://github.com/dervism/egon-mcp';

// A target with a scheme, an #anchor or a leading // is not a path in the repository.
const local = '(?![a-z][a-z0-9+.-]*:|#|//)';
const at = (path, kind = 'blob') => `${repo}/${kind}/v${version}/${path.replace(/^\.?\//, '')}`;
const inline = new RegExp(`(!?)\\[([^\\]]*)\\]\\(${local}(<?)([^)\\s>]+)(>?)((?:\\s+(?:"[^"]*"|'[^']*'|\\([^)]*\\)))?)\\)`, 'gi');
const reference = new RegExp(`^(\\s*\\[(?!\\^)[^\\]]+\\]:\\s*)${local}(<?)([^\\s>]+)(>?)`, 'i');

let fenced = false;
const readme = readFileSync(join(repoDir, 'README.md'), 'utf8')
  .split('\n')
  .map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) {
      return line;
    }
    return line
      .replace(inline, (_, bang, text, open, path, close, title) => `${bang}[${text}](${open}${at(path, bang ? 'raw' : 'blob')}${close}${title})`)
      .replace(reference, (_, label, open, path, close) => `${label}${open}${at(path)}${close}`);
  })
  .join('\n');
writeFileSync(join(packageDir, 'README.md'), readme);
cpSync(join(repoDir, 'LICENSE'), join(packageDir, 'LICENSE'));
rmSync(join(packageDir, 'skill'), { recursive: true, force: true });
cpSync(join(repoDir, 'skills', 'egon-mcp-skill'), join(packageDir, 'skill'), { recursive: true });
