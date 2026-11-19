export function createTextCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

export function createActionCell(text, onActivate) {
  const cell = document.createElement("td");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = text;
  button.addEventListener("click", onActivate);
  cell.append(button);
  return cell;
}

export function createMessageRow(columnCount, text) {
  const row = document.createElement("tr");
  const cell = createTextCell(text);
  cell.colSpan = columnCount;
  cell.className = "empty-state";
  row.append(cell);
  return row;
}
