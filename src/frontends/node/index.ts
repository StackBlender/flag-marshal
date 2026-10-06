/**
 * Node adapters for the core's ports, shared by every Node-hosted frontend.
 *
 * These implement `FileSystem`, `GitHistory` and baseline storage against the
 * real machine. They live outside `core/` because the engine must stay testable
 * against a synthetic tree, and outside any one frontend because the CLI, the RPC
 * server, and the VS Code extension host all run on Node and all need exactly
 * these three.
 */
export { nodeFileSystem } from './node-filesystem.js';
export { nodeGitHistory } from './node-git.js';
export { nodeBaselines } from './node-baselines.js';
