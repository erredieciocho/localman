import { extractWords } from "../glossary/index.js";

export function createTranslationWordUsageIndex(localisation) {
  const words = new Map();
  let totalEntries = 0;
  for (const section of localisation.sections) {
    if (!section.name) {
      continue;
    }
    const translationIndex = section.columns.indexOf("Translation");
    if (translationIndex < 0) {
      continue;
    }
    for (const row of section.rows) {
      totalEntries += 1;
      const translation = row.fields[translationIndex] ?? "";
      updateWordCounts(words, section, row, translation, 1);
    }
  }
  return { words, totalEntries };
}

export function updateTranslationWordUsageIndex(index, section, row, previousText, nextText) {
  if (!index || !section.name || !section.columns.includes("Translation")) return;
  updateWordCounts(index.words, section, row, previousText, -1);
  updateWordCounts(index.words, section, row, nextText, 1);
}

export function collectTranslationWordUsage(localisation, { minimumLength = 3, maximumLength = Infinity } = {}) {
  const index = createTranslationWordUsageIndex(localisation);
  return [...index.words.values()]
    .filter(({ word }) => {
      const length = [...word].length;
      return length >= minimumLength && length <= maximumLength;
    })
    .map((entry) => ({
      ...entry,
      uniqueEntries: entry.occurrences.length,
      percentage: index.totalEntries ? entry.occurrences.length / index.totalEntries * 100 : 0,
    }))
    .sort((left, right) => right.frequency - left.frequency || left.word.localeCompare(right.word));
}

function updateWordCounts(words, section, row, text, increment) {
  const counts = new Map();
  for (const word of extractWords(text)) counts.set(word, (counts.get(word) ?? 0) + 1);

  for (const [word, count] of counts) {
    const entry = words.get(word) ?? { word, frequency: 0, occurrences: [] };
    entry.frequency += count * increment;
    if (increment > 0) {
      entry.occurrences.push({ section, row, text });
      words.set(word, entry);
    } else {
      entry.occurrences = entry.occurrences.filter((occurrence) =>
        occurrence.section !== section || occurrence.row !== row);
      if (entry.frequency <= 0) words.delete(word);
    }
  }
}
