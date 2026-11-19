import { createActionCell, createTextCell } from "../components/table-cells.js";
import { createModalComponent } from "../components/modal.js";
import { createTableComponent } from "../components/table.js";

export function setupOccurrences(root, onSection, onEntry) {
  const modal = createModalComponent(root.querySelector("#occurrences-dialog"));
  const body = createTableComponent(root.querySelector("#occurrences-rows").closest("table")).rows;
  return (title, occurrences) => {
    modal.title.textContent = title;
    body.replaceChildren();
    if (!occurrences.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.textContent = "No matching entries.";
      row.append(cell);
      body.append(row);
    }
    for (const occurrence of occurrences) {
      const tr = document.createElement("tr");
      for (const [label, action] of [
        [occurrence.section.name || `Unnamed section ${occurrence.section.index + 1}`, () => onSection(occurrence.section.index)],
        [occurrence.row.key || `Row ${occurrence.row.index + 1}`, () => onEntry(
          occurrence.section.index, (occurrence.rows ?? [occurrence.row]).map((row) => row.index),
        )],
      ]) {
        tr.append(createActionCell(label, () => {
          modal.close();
          action();
        }));
      }
      tr.append(createTextCell(occurrence.text));
      body.append(tr);
    }
    modal.show();
  };
}
