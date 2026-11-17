/**
 * 本地演示版的文件本体存储：IndexedDB 保存 Blob，元信息保存在 localStorage。
 * 换设备不可见 —— 待云服务开通后由 Storage + 数据表替换这一层。
 */

const DB_NAME = "acg-transfer";
const DB_VERSION = 1;
const STORE = "blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
    req.onblocked = () => reject(new Error("IndexedDB 被其他标签页占用"));
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 操作失败"));
  });
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  await tx("readwrite", (s) => s.put(blob, key));
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>("readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>);
}

export async function deleteBlob(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}

export async function clearBlobs(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
}

/** 估算浏览器给本站的可用配额，用于容量仪表 */
export async function readQuota(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}
