#!/usr/bin/env node
import { run } from './cli.js';
import { nodeFileSystem } from '../node/node-filesystem.js';
import { nodeGitHistory } from '../node/node-git.js';
import { nodeBaselines } from '../node/node-baselines.js';
import { serveStdio } from '../rpc/stdio.js';
import { createSettingsFile } from '../node/node-settings.js';

process.exitCode = await run(process.argv.slice(2), {
  fs: nodeFileSystem,
  git: (root) => nodeGitHistory(root),
  baselines: nodeBaselines,
  createSettings: createSettingsFile,
  serve: () =>
    serveStdio(process.stdin, process.stdout, {
      fs: nodeFileSystem,
      cwd: process.cwd(),
      git: (root) => nodeGitHistory(root),
    }),
  cwd: process.cwd(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
