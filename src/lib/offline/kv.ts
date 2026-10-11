import { openDB, type IDBPDatabase } from "idb";

// A tiny IndexedDB key-value store for the offline cache, opened on first use.
let dbp: Promise<IDBPDatabase> | null = null;
const db = () => (dbp ??= openDB("stoga-cache", 1, { upgrade: (d) => d.createObjectStore("kv") }));

export async function get(key: string): Promise<string | null> {
  try {
    return ((await (await db()).get("kv", key)) as string | undefined) ?? null;
  } catch {
    return null;
  }
}
export async function set(key: string, value: string) {
  try {
    await (await db()).put("kv", value, key);
  } catch {
    /* storage full or blocked: the app still works online */
  }
}
export async function del(key: string) {
  try {
    await (await db()).delete("kv", key);
  } catch {
    /* nothing to remove */
  }
}
