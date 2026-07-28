/**
 * Writable app data root — `.data` locally, `/tmp` on Vercel/serverless.
 */

import fs from 'fs/promises';
import path from 'path';

export function isServerlessDataHost(): boolean {
  return (
    process.env.VERCEL === '1' ||
    process.env.VERCEL === 'true' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.VERCEL_ENV)
  );
}

/** Directory for sessions, archives, report files (not committed to git). */
export function getAppDataDir(): string {
  if (isServerlessDataHost()) {
    return path.join('/tmp', 'trademind-pro-data');
  }
  return path.join(process.cwd(), '.data');
}

export async function ensureAppDataDir(): Promise<string> {
  const dir = getAppDataDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
