import { readdir, readFile } from 'node:fs/promises';
import type { DirectoryEntry, FileSystem } from '../../core/api/index.js';

/**
 * The Node implementation of the core's filesystem port.
 *
 * This lives in the frontend, not the core, so the engine stays testable against
 * a synthetic tree and reusable from an editor's in-memory buffers.
 */
export const nodeFileSystem: FileSystem = {
  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      isSymbolicLink: entry.isSymbolicLink(),
    }));
  },

  readFile(path: string): Promise<string> {
    return readFile(path, 'utf8');
  },
};
