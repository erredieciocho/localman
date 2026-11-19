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
    const englishIndex = section.columns.indexOf("English");
    const translationIndex = section.columns.indexOf("Translation");
    if (typeIndex < 0 || englishIndex < 0 || translationIndex < 0) {
      continue;
    }

    const type = section.columns[typeIndex].replace(/s$/u, "");
    for (const row of section.rows) {
      const english = row.fields[englishIndex] ?? "";
      const englishWords = new Set(extractWords(english));
      if (englishWords.size === 0) {
        continue;
      }
      const id = row.fields[typeIndex] ?? "";
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
      term.translation = mergeText(term.translation, row.fields[translationIndex] ?? "");
      term.englishWords = new Set(extractWords(term.english));
      term.translationWords = new Set(extractWords(term.translation));
    }
  }

  for (const section of localisation.sections) {
    const descriptionsIndex = section.columns.indexOf("Descriptions");
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
  for (const term of terms) {
    for (const word of term.englishWords) {
      const candidates = termsByEnglishWord.get(word) ?? [];
      candidates.push(term);
      termsByEnglishWord.set(word, candidates);
    }
  }

  for (const section of localisation.sections) {
    const englishIndex = section.columns.indexOf("English");
    const translationIndex = section.columns.indexOf("Translation");
    if (!section.name || englishIndex < 0 || translationIndex < 0) {
      continue;
    }

    for (const group of getGroupedRows(section)) {
      const englishWords = new Set(extractWords(group.english));
      const translationWords = new Set(extractWords(group.translation));
      const candidates = new Set();
      for (const word of englishWords) {
        for (const term of termsByEnglishWord.get(word) ?? []) {
          candidates.add(term);
        }
      }
      for (const term of candidates) {
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
