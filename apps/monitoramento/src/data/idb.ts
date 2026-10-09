/** Camada mínima sobre IndexedDB: um banco com várias "stores" chaveadas por id. */
const DB_NAME = "monitoramentos";
const DB_VERSION = 1;
export const STORES = ["units", "points", "readings", "outbox", "photos", "meta"] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, s === "outbox" ? { autoIncrement: true } : undefined);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        t.oncomplete = () => resolve(r.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const idb = {
  get: <T>(store: StoreName, key: IDBValidKey) => tx<T | undefined>(store, "readonly", (s) => s.get(key)),
  put: (store: StoreName, key: IDBValidKey, value: unknown) => tx(store, "readwrite", (s) => s.put(value, key)),
  del: (store: StoreName, key: IDBValidKey) => tx(store, "readwrite", (s) => s.delete(key)),
  all: <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll()),
  keys: (store: StoreName) => tx<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()),
  add: (store: StoreName, value: unknown) => tx(store, "readwrite", (s) => s.add(value)),
  clear: (store: StoreName) => tx(store, "readwrite", (s) => s.clear())
};
