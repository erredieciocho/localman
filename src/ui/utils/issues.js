import { collectValidationIssues } from "../../core/validation/index.js";
import {
  createActionCell,
  createMessageRow,
  createTextCell,
} from "../components/table-cells.js";
import { createModalComponent } from "../components/modal.js";
import { createTableComponent } from "../components/table.js";

export function renderIssues(root, localisation, preferences, sectionIndex, onSection, onEntry, dictionary = null, cachedIssues) {
  const issues = cachedIssues ?? (localisation ? collectValidationIssues(localisation, { ...preferences, dictionary }) : []);
  const visible = sectionIndex === "all"
    ? issues.filter((issue) => issue.section.name && issue.section.columns.includes("Translation"))
    : issues.filter((issue) => issue.section.index === sectionIndex);
  const percentage = issues.length ? visible.length / issues.length * 100 : 0;
  root.querySelector("#validation-count").textContent =
    `${visible.length} / ${issues.length} issues (${percentage.toFixed(2)}%)`;
  const body = createTableComponent(root.querySelector("#validation-rows").closest("table")).rows;
  body.replaceChildren();
  for (const issue of visible) {
    const tr = document.createElement("tr");
    for (const [text, action] of [
      [issue.section.name, () => onSection(issue.section.index)],
      [issue.row.key || `Row ${issue.row.index + 1}`, () => onEntry(issue.section.index, issue.row.index)],
    ]) {
      tr.append(createActionCell(text, action));
    }
    tr.append(createTextCell(issue.message));
    body.append(tr);
  }
  if (!visible.length) {
    body.append(createMessageRow(3, localisation
      ? "No configured translation checks were triggered in this section."
      : "Load a file to run configured checks."));
  }
}

export function setupRowIssuesDialog(root) {
  const modal = createModalComponent(root.querySelector("#row-issues-dialog"));
  const body = createTableComponent(root.querySelector("#row-issues-rows").closest("table")).rows;
  return (section, row, issues) => {
    modal.title.textContent = `${row.key || `Row ${row.index + 1}`} — ${issues.length} ${issues.length === 1 ? "issue" : "issues"}`;
    body.replaceChildren();
    for (const issue of issues) {
      const tr = document.createElement("tr");
      tr.append(createTextCell(issue.kind), createTextCell(issue.message));
      body.append(tr);
    }
    if (!issues.length) {
      body.append(createMessageRow(
        2,
        `No current issues for this entry in ${section.name || `section ${section.index + 1}`}.`,
      ));
    }
    modal.show();
  };
}
