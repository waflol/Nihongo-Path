/**
 * Keeps an in-progress bulk import across a page reload (F5): the chosen file
 * (IndexedDB — a File can't go into localStorage), the target deck and the
 * column mapping. Cleared on cancel / successful confirm. Every call is
 * best-effort: storage may be blocked (private window), then nothing persists.
 */

const DB = "nihongo-import-draft";
const STORE = "draft";
const KEY = "current";

export interface ImportDraft {
  file: File;
  deckId: string;
  mapping: Record<string, string>;
  previewed: boolean;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return undefined;
  }
}

export async function saveImportDraft(draft: ImportDraft): Promise<void> {
  await run("readwrite", (s) => s.put(draft, KEY));
}

export async function loadImportDraft(): Promise<ImportDraft | null> {
  const d = await run<ImportDraft | undefined>("readonly", (s) => s.get(KEY));
  return d?.file instanceof Blob ? d : null;
}

export async function clearImportDraft(): Promise<void> {
  await run("readwrite", (s) => s.delete(KEY));
}
