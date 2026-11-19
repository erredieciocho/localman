import { extractWords, getGroupedRows, getTermDefinitions } from "../glossary/index.js";
import { spellingWords } from "../spellcheck/index.js";

const spellingCache = new WeakMap();

export function getSpellingResult(dictionary, word) {
  if (!dictionary) return null;
  let cache = spellingCache.get(dictionary);
  if (!cache) {
    cache = new Map();
    spellingCache.set(dictionary, cache);
  }
  const cacheKey = word.toLocaleLowerCase();
  if (!cache.has(cacheKey)) cache.set(cacheKey, dictionary.check(word));
  return cache.get(cacheKey);
}

export function isWordExcluded(word, exclusions = []) {
  const normalisedWord = word.trim().toLocaleLowerCase();
  return exclusions.some((excluded) => excluded.trim().toLocaleLowerCase() === normalisedWord);
}

export function collectValidationIssues(localisation, {
  minSentenceLength = 0,
  maxSentenceLength = 70,
  terminologyValidation = false,
  dictionary = null,
  dictionaryExclusions = [],
} = {}) {
  const issues = [];
  const terms = terminologyValidation ? getTermDefinitions(localisation) : [];
  const exclusions = new Set(dictionaryExclusions.map((word) => word.trim().toLocaleLowerCase()));

  for (const section of localisation.sections) {
    if (!section.name) {
      continue;
    }
    const englishIndex = section.columns.indexOf("English");
    const translationIndex = section.columns.indexOf("Translation");
    if (translationIndex < 0) {
      continue;
    }
    if (dictionary) {
      for (const row of section.rows) {
        if (localisation.getRowStatus(section, row) !== "translated") continue;
        const words = new Set(spellingWords(row.fields[translationIndex] ?? ""));
        for (const word of words) {
          if (exclusions.has(word.toLocaleLowerCase())) continue;
          if (!getSpellingResult(dictionary, word)) {
            issues.push({ kind: "spelling", message: `Possible spelling error: "${word}".`, section, row });
          }
        }
      }
    }
    for (const group of getGroupedRows(section)) {
      if (!group.translation.trim()) {
        continue;
      }
      const row = group.first;
      if (group.translation.length <= minSentenceLength) {
        issues.push({
          kind: "sentence-length",
          message: `Translation is at or below the ${minSentenceLength}-character minimum.`,
          section,
          row,
        });
      }
      if (group.translation.length > maxSentenceLength) {
        issues.push({
          kind: "sentence-length",
          message: `Translation exceeds the ${maxSentenceLength}-character maximum.`,
          section,
          row,
        });
      }
      if (!terminologyValidation || englishIndex < 0 || !terms.length) {
        continue;
      }
      const sourceWords = new Set(extractWords(group.english));
      const targetWords = new Set(extractWords(group.translation));
      for (const term of terms) {
        if (!containsAll(sourceWords, term.englishWords)
          || containsAll(targetWords, term.translationWords)) {
          continue;
        }
        issues.push({
          kind: "terminology",
          message: `Missing glossary translation "${term.translation}" for "${term.english}".`,
          section,
          row,
        });
      }
    }
  }
  return issues;
}

function containsAll(words, required) {
  for (const word of required) {
    if (!words.has(word)) {
      return false;
    }
  }
  return true;
}
