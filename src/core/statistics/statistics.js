export function getTranslationStatistics(document) {
  let total = 0;
  let translated = 0;
  let untranslated = 0;
  let untranslatable = 0;

  for (const section of document.sections) {
    if (!section.name) {
      continue;
    }
    for (const row of section.rows) {
      const status = document.getRowStatus(section, row);
      if (status === "non-translatable") {
        continue;
      }
      if (status === "untranslatable") {
        untranslatable += 1;
        continue;
      }

      total += 1;
      if (status === "translated") {
        translated += 1;
      } else {
        untranslated += 1;
      }
    }
  }

  return {
    total,
    translated,
    untranslated,
    untranslatable,
    percentage: total === 0 ? 0 : Math.round((translated / total) * 1000) / 10,
  };
}
