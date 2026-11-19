import Typo from "../../vendor/typo-js/typo.js";

let idleSchedulerUsers = 0;
let nativeIdleCallback;

function scheduleDictionaryIdle(callback) {
  return window.setTimeout(() => {
    const started = performance.now();
    callback({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 8 - (performance.now() - started)),
    });
  }, 0);
}

function acquireIdleScheduler() {
  if (idleSchedulerUsers === 0) {
    nativeIdleCallback = window.requestIdleCallback;
    window.requestIdleCallback = scheduleDictionaryIdle;
  }
  idleSchedulerUsers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    idleSchedulerUsers -= 1;
    if (idleSchedulerUsers === 0 && window.requestIdleCallback === scheduleDictionaryIdle) {
      if (nativeIdleCallback) window.requestIdleCallback = nativeIdleCallback;
      else delete window.requestIdleCallback;
    }
  };
}

export async function loadPackagedDictionary(packageFile, language) {
  if (!packageFile || !/\.(?:oxt|xpi|zip)$/i.test(packageFile.name)) {
    throw new Error("Select an OXT, XPI, or ZIP dictionary package.");
  }
  if (!globalThis.JSZip) {
    throw new Error("The bundled ZIP library is unavailable. Reload the application and try again.");
  }

  let archive;
  try {
    archive = await globalThis.JSZip.loadAsync(packageFile);
  } catch (error) {
    throw new Error(`The ${packageFile.name} archive could not be opened: ${error.message ?? String(error)}`);
  }
  const files = Object.values(archive.files).filter((file) => !file.dir);
  const affixes = files.filter((file) => /\.aff$/i.test(file.name));
  const words = files.filter((file) => /\.dic$/i.test(file.name));
  const pairs = [];
  for (const affFile of affixes) {
    const stem = affFile.name.replace(/\.aff$/i, "").toLocaleLowerCase();
    const dicFile = words.find((file) =>
      file.name.replace(/\.dic$/i, "").toLocaleLowerCase() === stem);
    if (dicFile) pairs.push({ affFile, dicFile, stem: stem.split("/").at(-1) });
  }
  if (!pairs.length) {
    throw new Error("The archive contains no matching Hunspell .aff and .dic files.");
  }
  const languageMatches = pairs.filter(({ stem }) =>
    stem === language.toLocaleLowerCase()
      || stem.startsWith(`${language.toLocaleLowerCase()}_`)
      || stem.startsWith(`${language.toLocaleLowerCase()}-`));
  const candidates = languageMatches.length ? languageMatches : pairs;
  if (candidates.length > 1) {
    throw new Error(`The archive contains multiple dictionaries for ${language}; select a package with a single matching dictionary.`);
  }

  const [{ affFile, dicFile }] = candidates;
  let aff;
  let dic;
  try {
    [aff, dic] = await Promise.all([
      affFile.async("uint8array"),
      dicFile.async("uint8array"),
    ]);
  } catch (error) {
    throw new Error(`Could not extract dictionary files from the archive: ${error.message ?? String(error)}`);
  }
  return loadDictionary(
    new File([aff], affFile.name.split("/").at(-1)),
    new File([dic], dicFile.name.split("/").at(-1)),
    language,
  );
}

export const loadOxtDictionary = loadPackagedDictionary;

export async function loadBundledDictionaryCatalog() {
  const response = await fetch(new URL("../../../bundled/dictionaries/manifest.json", import.meta.url));
  if (!response.ok) throw new Error(`Dictionary list request failed (${response.status}).`);
  const manifest = await response.json();
  if (!Array.isArray(manifest.dictionaries)
    || manifest.dictionaries.some((entry) => !entry.id || !entry.name || !entry.language
      || entry.format !== "aff-dic" || !entry.aff || !entry.dic)) {
    throw new Error("The bundled dictionary list is malformed.");
  }
  return manifest.dictionaries;
}

export async function loadBundledDictionary(entry) {
  if (!entry || entry.format !== "aff-dic" || !entry.aff || !entry.dic || !entry.language) {
    throw new Error("The bundled dictionary manifest entry is invalid.");
  }
  const fetchAsset = async (path) => {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) throw new Error(`Could not fetch bundled dictionary file "${path}" (${response.status}).`);
    return new File([await response.arrayBuffer()], path.split("/").at(-1));
  };
  const [aff, dic] = await Promise.all([fetchAsset(entry.aff), fetchAsset(entry.dic)]);
  return loadDictionary(aff, dic, entry.language);
}

export async function loadDictionary(affFile, dicFile, language) {
  if (!affFile || !dicFile) throw new Error("Select both a .aff file and its matching .dic file.");
  if (!/\.aff$/i.test(affFile.name) || !/\.dic$/i.test(dicFile.name)) {
    throw new Error("Select a Hunspell .aff file and a .dic file.");
  }
  const affBytes = await affFile.arrayBuffer();
  const header = new TextDecoder("windows-1252").decode(affBytes);
  const encoding = header.match(/^\s*SET\s+(\S+)/im)?.[1];
  if (!encoding) throw new Error("The .aff file must declare its character encoding with SET.");
  let decoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: true });
  } catch {
    throw new Error(`The dictionary encoding "${encoding}" is not supported by this browser.`);
  }
  let aff;
  let dic;
  try {
    aff = decoder.decode(affBytes);
    dic = decoder.decode(await dicFile.arrayBuffer());
  } catch {
    throw new Error(`The dictionary files cannot be decoded as ${encoding}.`);
  }
  if (!/^\s*\d+\s*(?:\r?\n|$)/u.test(dic)) {
    throw new Error("The .dic file must begin with a Hunspell word count.");
  }
  const dictionary = await new Promise((resolve, reject) => {
    const restoreIdleCallback = acquireIdleScheduler();
    const timeout = setTimeout(() => {
      restoreIdleCallback();
      reject(new Error("Dictionary parsing timed out."));
    }, 120000);
    let instance;
    const finish = (result) => {
      clearTimeout(timeout);
      restoreIdleCallback();
      resolve(result);
    };
    try {
      instance = new Typo(language, aff, dic, {
        asyncLoad: true,
        loadedCallback: finish,
      });
      if (instance.loaded) finish(instance);
    } catch (error) {
      clearTimeout(timeout);
      restoreIdleCallback();
      reject(error);
    }
  });
  if (!dictionary.loaded || dictionary.dictionaryTable.size === 0) {
    throw new Error("The dictionary contains no usable words.");
  }
  return dictionary;
}
