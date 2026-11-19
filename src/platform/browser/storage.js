export function createBrowserStorage(storageOwner = globalThis) {
  if (!storageOwner) return null;
  let storage;
  try {
    storage = typeof storageOwner.getItem === "function"
      ? storageOwner
      : storageOwner.localStorage;
  } catch (error) {
    return Object.freeze({
      getItem() { throw error; },
      setItem() { throw error; },
      removeItem() { throw error; },
    });
  }
  if (!storage) return null;

  return Object.freeze({
    getItem(key) {
      return storage.getItem(key);
    },
    setItem(key, value) {
      storage.setItem(key, value);
    },
    removeItem(key) {
      storage.removeItem(key);
    },
  });
}
