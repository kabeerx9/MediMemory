import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@caretalk/env/server";

// Durable storage for report originals. Deliberately a tiny interface with one
// local-disk implementation: the target deployment is a single VPS, and an
// object-store driver can slot in behind the same three methods later.

export interface FileStore {
  put(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

// Keys are always server-generated "<workspaceId>/<fileId>" (UUIDs). Checking
// the shape here, at the only place keys become paths, means a bug elsewhere
// can't turn into path traversal.
const KEY_PATTERN = /^[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}$/;

export function createLocalFileStore(root: string): FileStore {
  const absoluteRoot = path.resolve(root);

  const resolveKey = (key: string) => {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return path.join(absoluteRoot, key);
  };

  return {
    async put(key, data) {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      // wx: never overwrite. A key collision is a bug, not a replace.
      await writeFile(target, data, { flag: "wx", mode: 0o600 });
    },
    read(key) {
      return readFile(resolveKey(key));
    },
    async remove(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}

export const fileStore: FileStore | null = env.FILES_DIR ? createLocalFileStore(env.FILES_DIR) : null;
