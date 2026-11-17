// Publishes the version in package.json to npm with your npm login
// (DEVELOPMENT.md, Releasing). It checks that the working tree is clean and
// that the tag v<version> points at HEAD, here and on GitHub, runs the tests,
// packs a clean build, publishes that tarball and prints its SHA-256 for the
// Homebrew formula. Other arguments, such as --otp <code>, go on to npm publish.
//
// Usage: npm run release [-- --dry-run]
// A dry run may come before the tag is on GitHub, and publishes nothing.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const git = (...args) => execFileSync('git', args, { cwd: packageDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const commitOf = (ref) => {
  try {
    return git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch {
    return undefined;
  }
};

// "npm run release --dry-run" reaches the script as npm_config_dry_run; it must not
// make npm pack skip the tarball, so it goes to npm publish as an argument instead.
const args = process.argv.slice(2);
const dryRun = args.some((arg) => /^--dry-run(=true)?$/.test(arg)) || process.env.npm_config_dry_run === 'true';
const env = { ...process.env };
delete env.npm_config_dry_run;
if (dryRun && !args.some((arg) => arg.startsWith('--dry-run'))) {
  args.push('--dry-run');
}

// The npm that runs this script, or the one on the PATH.
const npmCli = process.env.npm_execpath && /npm-cli\.js$/.test(process.env.npm_execpath) ? process.env.npm_execpath : undefined;
const npm = (...npmArgs) => {
  try {
    if (npmCli) {
      execFileSync(process.execPath, [npmCli, ...npmArgs], { cwd: packageDir, stdio: 'inherit', env });
    } else {
      execFileSync('npm', npmArgs, { cwd: packageDir, stdio: 'inherit', env, shell: process.platform === 'win32' });
    }
  } catch {
    fail(`npm ${npmArgs[0]} failed; see its output above.`);
  }
};

const { name, version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const tag = `v${version}`;
if (git('status', '--porcelain') !== '') {
  fail('Commit or stash your changes first, so the package matches the tag.');
}
const tagged = commitOf(tag);
if (tagged === undefined) {
  fail(`Tag ${tag} is missing: git tag ${tag}`);
}
if (tagged !== git('rev-parse', 'HEAD')) {
  fail(`Tag ${tag} points at another commit than HEAD. Move it with git tag -f ${tag} if it has not been pushed yet.`);
}
// ls-remote lists an annotated tag twice, the second time peeled to its commit.
let remote = '';
try {
  remote = git('ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
} catch {
  fail('Could not reach origin to check the tag.');
}
const lines = remote.split('\n').filter(Boolean);
const remoteCommit = (lines.find((line) => line.endsWith('^{}')) ?? lines[0])?.split(/\s/)[0];
if (remoteCommit === undefined) {
  if (!dryRun) {
    fail(`Push the tag first, so the README on npm can link to it: git push origin ${tag}`);
  }
  console.error(`${tag} is not on GitHub yet; push it before the real release: git push origin ${tag}`);
} else if (remoteCommit !== tagged) {
  fail(`${tag} on GitHub points at another commit than here. Publish from the commit GitHub has, or tag a new version.`);
}

// Lifecycle scripts on, whatever the npm config says: pretest and prepack build the package.
npm('test', '--ignore-scripts=false');
const tarball = `${name}-${version}.tgz`;
rmSync(join(packageDir, tarball), { force: true });
npm('pack', '--ignore-scripts=false');
npm('publish', tarball, ...args);
const sha = createHash('sha256').update(readFileSync(join(packageDir, tarball))).digest('hex');
console.log(`\n${dryRun ? 'Checked' : 'Published'} ${name}@${version}. SHA-256 of ${tarball} for the Homebrew formula:\n${sha}`);
