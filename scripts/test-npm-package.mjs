/** Packs, installs, and executes the same directory that will be published. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = resolve(root, 'artifacts', 'npm', 'package');
const fixture = resolve(root, 'fixtures', 'ts-launchdarkly');
const scratch = await mkdtemp(resolve(tmpdir(), 'flag-marshal-package-'));
const cache = resolve(scratch, 'npm-cache');
const repository = 'https://github.com/StackBlender/flag-marshal';

const npm = (args, cwd = root) =>
  execFileSync('npm', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, NPM_CONFIG_CACHE: cache },
  }).trim();

try {
  const tarballName = npm(['pack', artifact, '--pack-destination', scratch, '--json']);
  const [{ filename }] = JSON.parse(tarballName);
  npm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(scratch, filename)],
    scratch,
  );

  const manifest = JSON.parse(await readFile(resolve(artifact, 'package.json'), 'utf8'));
  // Every public link must resolve to the public source repository, which holds
  // the issue forms and security reporting.
  const links = [manifest.repository?.url, manifest.homepage, manifest.bugs?.url];
  if (!links.every((link) => typeof link === 'string' && link.startsWith(repository))) {
    throw new Error(`package links must point to ${repository}: ${JSON.stringify(links)}`);
  }
  const readme = await readFile(resolve(artifact, 'README.md'), 'utf8');
  if (!readme.includes(`${repository}/issues/new/choose`)) {
    throw new Error('package README must link to the repository issue forms');
  }

  const cli = resolve(scratch, 'node_modules', '.bin', 'flag-marshal');
  const version = execFileSync(cli, ['--version'], { cwd: scratch, encoding: 'utf8' }).trim();
  if (version !== manifest.version) {
    throw new Error(`installed CLI reported ${version}; expected ${manifest.version}`);
  }

  const report = execFileSync(cli, ['scan', fixture, '--json', '--no-git'], {
    cwd: scratch,
    encoding: 'utf8',
  });
  if (!JSON.parse(report).flags.some((flag) => flag.key === 'checkout-v2')) {
    throw new Error('installed CLI did not detect the fixture flag');
  }

  console.log(`Installed artifact smoke test passed for ${manifest.name}@${manifest.version}.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
