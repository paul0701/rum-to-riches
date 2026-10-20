import { getStore } from "@netlify/blobs";
import { HttpError } from "./http.js";

export const STORE_NAME = "rum-to-riches";
export const playerKey = (playerId) => `player:${playerId}`;
const MAX_RETRIES = 6;

const store = () => getStore({ name: STORE_NAME, consistency: "strong" });
const stamp = (record) => {
  record.updatedAt = new Date().toISOString();
  return record;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const loadRecord = (playerId) => store().get(playerKey(playerId), { type: "json" });

// Creates a brand-new save; returns false if the key already exists.
export async function createRecord(record) {
  const { modified } = await store().setJSON(playerKey(record.id), stamp(record), { onlyIfNew: true });
  return modified;
}

// Read-modify-write with ETag optimistic locking so parallel requests never overwrite each other.
// mutate(record|null) returns { result, changed }; it is re-run on a fresh copy after a conflict.
export async function updateRecord(playerId, mutate) {
  const key = playerKey(playerId);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const entry = await store().getWithMetadata(key, { type: "json" });
    const { result, changed } = await mutate(entry ? entry.data : null);
    if (!changed) return result;
    const { modified } = await store().setJSON(key, stamp(entry.data), entry.etag ? { onlyIfMatch: entry.etag } : {});
    if (modified) return result;
    await sleep(20 + Math.random() * 60 * (attempt + 1));
  }
  throw new HttpError(409, "Your ship's ledger is busy with another order. Please try again.");
}
