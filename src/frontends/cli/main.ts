#!/usr/bin/env node
import { run } from './cli.js';
import { nodeFileSystem } from '../node/node-filesystem.js';
import { isShallowRepository, nodeGitHistory } from '../node/node-git.js';
import { openGitSnapshot } from '../node/node-git-snapshot.js';
import { nodeBaselines } from '../node/node-baselines.js';
import { createSettingsFile } from '../node/node-settings.js';

process.exitCode = await run(process.argv.slice(2), {
  fs: nodeFileSystem,
  git: (root) => nodeGitHistory(root),
  snapshot: openGitSnapshot,
  shallow: isShallowRepository,
  env: process.env,
  baselines: nodeBaselines,
  createSettings: createSettingsFile,
  cwd: process.cwd(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
