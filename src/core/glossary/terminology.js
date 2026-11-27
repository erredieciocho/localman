import { isMapSection } from "../document/index.js";

const WORD_PATTERN = /\p{L}+(?:['’\-]\p{L}+)*/gu;
const TERM_COLUMNS = new Set(["Speakers", "Items"]);

export function extractWords(text) {
  return (text.match(WORD_PATTERN) ?? []).map((word) => word.toLocaleLowerCase());
}

export function getTermDefinitions(localisation) {
  const terms = [];
  const byId = new Map();

  for (const section of localisation.sections) {
    const typeIndex = section.columns.findIndex((column) => TERM_COLUMNS.has(column));
    const txtType = localisation.formatId === "txt"
      && ["Speakers", "Items"].includes(section.name)
      ? section.name.replace(/s$/u, "")
      : "";
    const englishIndex = section.columns.indexOf("English");
    const translationIndex = section.columns.indexOf("Translation");
    if ((typeIndex < 0 && !txtType) || englishIndex < 0 || translationIndex < 0) {
      continue;
    }

    const type = txtType || section.columns[typeIndex].replace(/s$/u, "");
    for (const row of section.rows) {
      const english = txtType ? "" : row.fields[englishIndex] ?? "";
      const translation = row.fields[translationIndex] ?? "";
      const termText = txtType ? translation : english;
      const termWords = new Set(extractWords(termText));
      if (termWords.size === 0) {
        continue;
      }
      const id = typeIndex >= 0 ? row.fields[typeIndex] ?? "" : row.key;
      let term = id ? byId.get(id) : null;
      if (!term) {
        term = {
          id,
          definitionSection: section,
          definitionRow: row,
          type,
          english: "",
          translation: "",
          description: "",
          translatedDescription: "",
          englishWords: new Set(),
          translationWords: new Set(),
          englishCount: 0,
          translationCount: 0,
          englishOccurrences: [],
          translationOccurrences: [],
        };
        terms.push(term);
        if (id) byId.set(id, term);
      }
      term.english = mergeText(term.english, english);
      term.translation = mergeText(term.translation, translation);
      term.englishWords = new Set(extractWords(term.english));
      term.translationWords = new Set(extractWords(term.translation));
    }
  }

  for (const section of localisation.sections) {
    const descriptionsIndex = section.columns.indexOf("Descriptions") >= 0
      ? section.columns.indexOf("Descriptions")
      : localisation.formatId === "txt" && section.name === "Descriptions"
        ? 0
        : -1;
    const itemIndex = section.columns.indexOf("Item") >= 0
      ? section.columns.indexOf("Item")
      : section.columns.indexOf("Items");
    const englishIndex = section.columns.indexOf("English");
    const translationIndex = section.columns.indexOf("Translation");
    if (descriptionsIndex < 0 || itemIndex < 0 || englishIndex < 0) {
      continue;
    }
    for (const row of section.rows) {
      const term = (row.key && byId.get(row.key))
        || (row.fields[itemIndex] && byId.get(row.fields[itemIndex]));
      if (term) {
        term.description = mergeText(term.description, row.fields[englishIndex] ?? "");
        term.translatedDescription = mergeText(
          term.translatedDescription,
          row.fields[translationIndex] ?? "",
        );
      }
    }
  }

  return terms;
}

function mergeText(previous, next) {
  return [previous.trim(), next.trim()].filter(Boolean).join(" ");
}

export function getGroupedRows(section) {
  const keyIndex = Math.max(0, section.columns.indexOf("ID"));
  const groups = [];
  for (let index = 0; index < section.rows.length;) {
    const first = section.rows[index];
    let end = index + 1;
    if (first.key) {
      while (end < section.rows.length && section.rows[end].key === first.key) {
        end += 1;
      }
    }
    groups.push({
      key: first.key,
      first,
      rows: section.rows.slice(index, end),
      english: "",
      translation: "",
    });
    index = end;
  }

  const englishIndex = section.columns.indexOf("English");
  const translationIndex = section.columns.indexOf("Translation");
  for (const group of groups) {
    group.english = group.rows.map((row) => row.fields[englishIndex] ?? "").join(" ");
    group.translation = group.rows.map((row) => row.fields[translationIndex] ?? "").join(" ");
  }
  return groups;
}

export function collectTerminology(localisation) {
  const terms = getTermDefinitions(localisation);
  const termsByEnglishWord = new Map();
  const termsByTranslationWord = new Map();
  for (const term of terms) {
    for (const word of term.englishWords) {
      const candidates = termsByEnglishWord.get(word) ?? [];
      candidates.push(term);
      termsByEnglishWord.set(word, candidates);
    }
    for (const word of term.translationWords) {
      const candidates = termsByTranslationWord.get(word) ?? [];
      candidates.push(term);
      termsByTranslationWord.set(word, candidates);
    }
  }

  const targetOnly = localisation.formatId === "txt";
  for (const section of localisation.sections) {
    const englishIndex = section.columns.indexOf("English");
    const translationIndex = section.columns.indexOf("Translation");
    if (!isMapSection(section) || englishIndex < 0 || translationIndex < 0) {
      continue;
    }

    for (const group of getGroupedRows(section)) {
      const englishWords = new Set(extractWords(group.english));
      const translationWords = new Set(extractWords(group.translation));
      const candidates = new Set();
      const words = targetOnly ? translationWords : englishWords;
      const termsByWord = targetOnly ? termsByTranslationWord : termsByEnglishWord;
      for (const word of words) {
        for (const term of termsByWord.get(word) ?? []) {
          candidates.add(term);
        }
      }
      for (const term of candidates) {
        if (targetOnly) {
          if (term.translationWords.size > 0 && containsAll(translationWords, term.translationWords)) {
            term.translationCount += 1;
            term.translationOccurrences.push({ section, row: group.first, rows: group.rows, text: group.translation });
          }
          continue;
        }
        if (!containsAll(englishWords, term.englishWords)) {
          continue;
        }
        term.englishCount += 1;
        term.englishOccurrences.push({ section, row: group.first, rows: group.rows, text: group.english });
        if (term.translationWords.size > 0 && containsAll(translationWords, term.translationWords)) {
          term.translationCount += 1;
          term.translationOccurrences.push({ section, row: group.first, rows: group.rows, text: group.translation });
        }
      }
    }
  }

  return terms.map((term) => ({
    ...term,
    usagePercentage: term.englishCount === 0
      ? 0
      : Math.round((term.translationCount / term.englishCount) * 10000) / 100,
  }));
}

function containsAll(words, required) {
  for (const word of required) {
    if (!words.has(word)) {
      return false;
    }
  }
  return true;
}
