function normalize(text) {
  return (text.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

function wordSimilarity(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  const length = Math.max(a.length, b.length);
  if (!length) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[b.length] / length;
}

function similarity(left, right) {
  const a = left.split(" ");
  const b = right.split(" ");
  const length = Math.max(a.length, b.length);
  if (!length) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (1 - wordSimilarity(a[i - 1], b[j - 1])),
      );
    }
    previous = current;
  }
  return Math.max(0, 1 - previous[b.length] / length);
}

export function findTranslationSuggestions(localisation, section, row, mode) {
  if (!["exact", "fuzzy"].includes(mode) || localisation.getRowStatus(section, row) !== "untranslated") return [];
  const sourceIndex = section.columns.indexOf("English");
  const source = sourceIndex < 0 ? "" : row.fields[sourceIndex] ?? "";
  const query = normalize(source);
  if (!query || !/\p{L}/u.test(query)) return [];
  const matches = new Map();
  for (const candidateSection of localisation.sections) {
    if (!candidateSection.name) continue;
    const englishIndex = candidateSection.columns.indexOf("English");
    const translationIndex = candidateSection.columns.indexOf("Translation");
    if (englishIndex < 0 || translationIndex < 0) continue;
    for (const candidate of candidateSection.rows) {
      if (localisation.getRowStatus(candidateSection, candidate) !== "translated") continue;
      const candidateSource = candidate.fields[englishIndex] ?? "";
      const normalized = normalize(candidateSource);
      const score = query === normalized ? 1 : mode === "fuzzy" ? similarity(query, normalized) : 0;
      if (score < 0.8) continue;
      const translation = candidate.fields[translationIndex];
      if ((matches.get(translation)?.score ?? -1) >= score) continue;
      matches.set(translation, { source: candidateSource, translation, score, section: candidateSection.name, key: candidate.key });
    }
  }
  return [...matches.values()].sort((a, b) => b.score - a.score || a.translation.localeCompare(b.translation)).slice(0, 5);
}
