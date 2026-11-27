import { isMapSection } from "../../core/document/index.js";

export function setupSectionList(select, onSelect) {
  select.addEventListener("change", () => {
    const sectionIndex = Number(select.value);
    if (Number.isInteger(sectionIndex)) {
      onSelect(sectionIndex);
    }
  });
}

export function renderSections(select, sections, { readOnly = false } = {}) {
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a section";
  placeholder.disabled = true;
  select.append(placeholder);

  if (!readOnly) {
    const maps = sections.filter((section) => isMapSection(section)
      && section.columns.includes("Translation"));
    const allMaps = document.createElement("option");
    allMaps.value = "all";
    allMaps.textContent = `All (Maps) (${maps.length} ${maps.length === 1 ? "map" : "maps"})`;
    allMaps.disabled = maps.length === 0;
    select.append(allMaps);
  }

  for (const section of sections) {
    const option = document.createElement("option");
    const name = section.name || `Unnamed section ${section.index + 1}`;
    const count = section.rows.length;
    option.value = String(section.index);
    option.textContent = `${name} (${count} ${count === 1 ? "row" : "rows"})`;
    select.append(option);
  }
  select.disabled = sections.length === 0;
  select.value = "";
}
