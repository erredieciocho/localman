export function getTranslationStatistics(document) {
  const statistics = {
    total: 0,
    translated: 0,
    untranslated: 0,
    untranslatable: 0,
  };

  for (const section of document.sections) {
    if (!section.name) {
      continue;
    }
    const sectionStatistics = getSectionTranslationStatistics(document, section);
    statistics.total += sectionStatistics.total;
    statistics.translated += sectionStatistics.translated;
    statistics.untranslated += sectionStatistics.untranslated;
    statistics.untranslatable += sectionStatistics.untranslatable;
  }

  return {
    ...statistics,
    percentage: statistics.total === 0
      ? 0
      : Math.min(100, Math.round((statistics.translated / statistics.total) * 1000) / 10),
  };
}

export function getSectionTranslationStatistics(document, section) {
  const translationIndex = section.columns.indexOf("Translation");
  if (translationIndex < 0) {
    return { total: 0, translated: 0, untranslated: 0, untranslatable: 0 };
  }

  if (document.formatId === "txt") {
    let translated = 0;
    let untranslated = 0;
    for (const row of section.rows) {
      const translation = row.fields[translationIndex] ?? "";
      translated += translation.split(/\r\n?|\n/u).filter((line) => line.trim()).length;
      if (!translation.trim()) untranslated += 1;
    }
    return {
      total: translated + untranslated,
      translated,
      untranslated,
      untranslatable: 0,
    };
  }

  let total = 0;
  let translated = 0;
  let untranslated = 0;
  let untranslatable = 0;
  for (const row of section.rows) {
    const status = document.getRowStatus(section, row);
    if (status === "non-translatable") continue;
    if (status === "untranslatable") {
      untranslatable += 1;
      continue;
    }
    total += 1;
    if (status === "translated") translated += 1;
    else untranslated += 1;
  }
  return { total, translated, untranslated, untranslatable };
}
