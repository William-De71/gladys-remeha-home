// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data/state.json (mode
// 0600, the only writable place of the container):
//   - `snapshots`: per appliance, the values the scene triggers compare
//     (status, water pressure OK, online, holiday);
//   - `energy`: per appliance, the cumulated index (kWh) and the figures of
//     the last days already counted (src/remeha.js, accountDays) — the energy
//     widget reads them too;
//   - `models`: per appliance, the model name of its technical details
//     (asked once, not at every restart).
// Never a token, a password nor an e-mail. A missing or unreadable file is an
// empty state: nothing fires on the first reading, the index starts from the
// energy of today (Gladys only uses its increases).
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';
const BUCKETS = ['snapshots', 'energy', 'models'];

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * @description Create the store.
 * @param {object} [options] - Options.
 * @param {string|null} [options.path] - The file (null: memory only, tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} The store.
 */
function createState({ path = DEFAULT_PATH, logger = null } = {}) {
  let data = Object.fromEntries(BUCKETS.map((bucket) => [bucket, {}]));
  let dirty = false;

  if (path) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      data = Object.fromEntries(
        BUCKETS.map((bucket) => [bucket, isObject(parsed?.[bucket]) ? parsed[bucket] : {}]),
      );
    } catch (err) {
      if (err.code !== 'ENOENT') logger?.warn(`Unreadable ${path}, starting afresh`);
    }
  }

  /**
   * @description Set a value of a bucket (marks the state dirty on a change).
   * @param {string} bucket - The bucket.
   * @param {string} id - The appliance id.
   * @param {unknown} value - The value.
   */
  function set(bucket, id, value) {
    if (JSON.stringify(data[bucket][id]) === JSON.stringify(value)) return;
    data[bucket][id] = value;
    dirty = true;
  }

  return {
    snapshot: (id) => data.snapshots[id] ?? null,
    setSnapshot: (id, snapshot) => set('snapshots', id, snapshot),
    /**
     * @param {string} id - The appliance id.
     * @returns {{kwh: number, since: string, days: object}|null} Its energy record.
     */
    energy: (id) => data.energy[id] ?? null,
    setEnergy: (id, record) => set('energy', id, record),
    /** @returns {string|null} The model name of an appliance. */
    model: (id) => (typeof data.models[id] === 'string' ? data.models[id] : null),
    setModel: (id, name) => set('models', id, name),
    /**
     * @description Drop the appliances Remeha no longer lists.
     * @param {string[]} ids - The ids to keep.
     */
    keep(ids) {
      const wanted = new Set(ids);
      for (const bucket of BUCKETS) {
        for (const id of Object.keys(data[bucket])) {
          if (!wanted.has(id)) {
            delete data[bucket][id];
            dirty = true;
          }
        }
      }
    },
    /** @description Write the file when something changed (atomically). */
    save() {
      if (!dirty || !path) return;
      try {
        mkdirSync(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
        renameSync(temporary, path);
        dirty = false;
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
}

export { DEFAULT_PATH, createState };
