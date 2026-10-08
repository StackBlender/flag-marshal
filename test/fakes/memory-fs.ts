import type { DirectoryEntry, FileSystem } from '../../src/core/api/index.js';

/** An in-memory workspace keyed by absolute path. */
export function memoryFs(files: Record<string, string>): FileSystem {
  return {
    readDirectory(path: string): Promise<DirectoryEntry[]> {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const names = new Set<string>();
      const dirs = new Set<string>();
      for (const full of Object.keys(files)) {
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash === -1) names.add(rest);
        else dirs.add(rest.slice(0, slash));
      }
      if (names.size === 0 && dirs.size === 0) return Promise.reject(new Error('ENOENT'));
      return Promise.resolve([
        ...[...dirs].map((name) => ({
          name,
          isDirectory: true,
          isFile: false,
          isSymbolicLink: false,
        })),
        ...[...names].map((name) => ({
          name,
          isDirectory: false,
          isFile: true,
          isSymbolicLink: false,
        })),
      ]);
    },
    readFile(path: string): Promise<string> {
      const text = files[path];
      return text === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(text);
    },
  };
}
