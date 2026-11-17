import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AppError, isValidState, seed } from './domain.mjs';

export function createStore(file) {
  let pending = Promise.resolve();
  let state;

  async function initialize() {
    if (state) return;
    try {
      const loaded = JSON.parse(await readFile(file, 'utf8'));
      if (loaded?.version !== 2) {
        throw new AppError(503, 'LEGACY_DATA_FILE', 'This data file cannot be used with registered accounts. Keep its backup and select a new AQUA_DATA_FILE path, or use the default accounts-state.json.');
      }
      if (!isValidState(loaded)) {
        throw new AppError(503, 'INVALID_DATA_FILE', 'The account data file is invalid. Restore a verified accounts data backup or select a new data file.');
      }
      state = loaded;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new AppError(503, 'INVALID_DATA_FILE', 'The account data file is invalid JSON. Restore a verified accounts data backup or select a new data file.');
      }
      if (error.code !== 'ENOENT') throw error;
      state = seed();
    }
  }

  async function persist(next) {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }

  function enqueue(operation) {
    const result = pending.then(async () => {
      await initialize();
      return operation();
    });
    pending = result.catch(() => {});
    return result;
  }

  return {
    read: () => enqueue(() => state),
    change: (apply) => enqueue(async () => {
      const next = structuredClone(state);
      const result = apply(next);
      await persist(next);
      state = next;
      return { state, result };
    }),
  };
}
