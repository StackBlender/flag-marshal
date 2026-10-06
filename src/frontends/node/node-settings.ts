import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SETTINGS_FILE } from '../../core/api/index.js';

/**
 * Creates `.flagmarshal.yml`, refusing to replace one.
 *
 * The `wx` flag makes "does it exist" and "write it" one operation, so a file
 * created between the CLI's check and this write is still never overwritten.
 */
export async function createSettingsFile(root: string, text: string): Promise<void> {
  await writeFile(resolve(root, SETTINGS_FILE), text, { encoding: 'utf8', flag: 'wx' });
}
