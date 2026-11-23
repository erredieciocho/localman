const DATABASE_NAME = "tcoaal-file-handles";
const STORE_NAME = "handles";

export function createFileHandleStore(indexedDBOwner = globalThis.indexedDB) {
  let databasePromise;

  function openDatabase() {
    if (!indexedDBOwner?.open) {
      return Promise.reject(new Error("Persistent file handles are unavailable in this browser."));
    }
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDBOwner.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open file-handle storage."));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }

  async function runTransaction(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      let result;
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error ?? new Error("File-handle storage failed."));
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error("File-handle storage failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("File-handle storage was aborted."));
    });
  }

  return Object.freeze({
    get(key) {
      return runTransaction("readonly", (store) => store.get(key));
    },
    set(key, value) {
      return runTransaction("readwrite", (store) => store.put(value, key));
    },
    delete(key) {
      return runTransaction("readwrite", (store) => store.delete(key));
    },
  });
}
