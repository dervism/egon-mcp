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
const target = `(<?)${local}([^)\\s<>]+)(>?)`;
const title = `((?:\\s+(?:"[^"]*"|'[^']*'|\\([^)]*\\)))?)`;
// Link text may hold one level of brackets, as in a linked image (a badge).
const text = '((?:[^\\[\\]]|\\[[^\\]]*\\])*)';
const image = new RegExp(`!\\[${text}\\]\\(${target}${title}\\)`, 'gi');
const link = new RegExp(`(?<!!)\\[${text}\\]\\(${target}${title}\\)`, 'gi');
const reference = new RegExp(`^(\\s*\\[(?!\\^)[^\\]]+\\]:\\s*)${target}`, 'i');
const at = (path, kind) => `${repo}/${kind}/v${version}/${path.replace(/^\.?\//, '')}`;
const rewrite = (prose) =>
  prose
    .replace(image, (_, words, open, path, close, label) => `![${words}](${open}${at(path, 'raw')}${close}${label})`)
    .replace(link, (_, words, open, path, close, label) => `[${words}](${open}${at(path, 'blob')}${close}${label})`)
    .replace(reference, (_, label, open, path, close) => `${label}${open}${at(path, 'blob')}${close}`);

// Code stays as written: fenced blocks, closed only by a fence of the same kind and at
// least the same length, and inline code spans.
let fence;
const readme = readFileSync(join(repoDir, 'README.md'), 'utf8')
  .split('\n')
  .map((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== undefined) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        fence = undefined;
      }
      return line;
    }
    if (marker) {
      fence = marker;
      return line;
    }
    return line
      .split(/(`+[^`]*`+)/)
      .map((part, index) => (index % 2 === 1 ? part : rewrite(part)))
      .join('');
  })
  .join('\n');
writeFileSync(join(packageDir, 'README.md'), readme);
cpSync(join(repoDir, 'LICENSE'), join(packageDir, 'LICENSE'));
rmSync(join(packageDir, 'skill'), { recursive: true, force: true });
cpSync(join(repoDir, 'skills', 'egon-mcp-skill'), join(packageDir, 'skill'), { recursive: true });
