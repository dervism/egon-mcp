// Publishes the version in package.json to npm (DEVELOPMENT.md, Releasing).
// It checks that the working tree is clean and that the tag v<version> points
// at HEAD and is on GitHub, runs the tests, packs a clean build, publishes
// that tarball and prints its SHA-256 for the Homebrew formula.
//
// Usage: npm run release [-- --otp <code>] [-- --dry-run]
//
// With NPM_TOKEN set, in the environment or in the repository's .env, it
// publishes with that token; otherwise with your npm login. The token goes to
// npm through the environment only, never on a command line or into a file.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: packageDir, encoding: 'utf8', ...options });
const succeeds = (command, args) => {
  try {
    run(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
// The npm that runs this script, or the one on the PATH.
const npm = (args, options) =>
  process.env.npm_execpath ? run(process.execPath, [process.env.npm_execpath, ...args], options) : run('npm', args, options);

const { name, version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const tag = `v${version}`;
if (run('git', ['status', '--porcelain']).trim() !== '') {
  fail('Commit or stash your changes first, so the package matches the tag.');
}
const head = run('git', ['rev-parse', 'HEAD']).trim();
if (!succeeds('git', ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`]) || run('git', ['rev-parse', `${tag}^{commit}`]).trim() !== head) {
  fail(`Tag ${tag} must point at HEAD: git tag ${tag}`);
}
if (!succeeds('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`])) {
  fail(`Push the tag first, so the README on npm can link to it: git push origin ${tag}`);
}

npm(['test'], { stdio: 'inherit' });
const tarball = `${name}-${version}.tgz`;
rmSync(join(packageDir, tarball), { force: true });
npm(['pack'], { stdio: 'inherit' });

const dotEnv = join(packageDir, '..', '.env');
const fromDotEnv = existsSync(dotEnv)
  ? readFileSync(dotEnv, 'utf8')
      .match(/^\s*(?:export\s+)?NPM_TOKEN\s*=\s*(.*?)\s*$/m)?.[1]
      ?.replace(/^(['"])(.*)\1$/, '$2')
  : undefined;
const token = process.env.NPM_TOKEN || fromDotEnv;
const args = process.argv.slice(2);
const env = { ...process.env };
let config;
if (token) {
  // npm fills in ${NPM_TOKEN} from the environment when it reads this file.
  config = mkdtempSync(join(tmpdir(), 'egon-npmrc-'));
  writeFileSync(join(config, 'npmrc'), '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n');
  env.NPM_TOKEN = token;
  args.push('--userconfig', join(config, 'npmrc'));
}
try {
  npm(['publish', tarball, ...args], { stdio: 'inherit', env });
} finally {
  if (config) {
    rmSync(config, { recursive: true, force: true });
  }
}
const sha = createHash('sha256').update(readFileSync(join(packageDir, tarball))).digest('hex');
console.log(`\n${args.includes('--dry-run') ? 'Checked' : 'Published'} ${name}@${version}. SHA-256 of ${tarball} for the Homebrew formula:\n${sha}`);
