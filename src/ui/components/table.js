const tableComponents = new WeakMap();

export function createTableComponent(table) {
  if (!table || table.localName !== "table") {
    throw new TypeError("A table component requires a table element.");
  }
  const existing = tableComponents.get(table);
  if (existing) return existing;

  const component = table.closest(".ui-table-component")
    ?? table.closest("dialog")
    ?? table.closest("details")
    ?? createTableWrapper(table);
  const header = component.querySelector(":scope > .ui-table-header, :scope > summary");
  if (!header) {
    throw new TypeError("A table component requires a header region.");
  }
  const body = table;
  const footer = component.querySelector(":scope > .ui-table-footer")
    ?? component.appendChild(component.ownerDocument.createElement("footer"));
  footer.classList.add("ui-table-footer");
  const head = table.tHead ?? table.createTHead();
  const rows = table.tBodies[0] ?? table.createTBody();
  const tableFooter = table.tFoot ?? table.createTFoot();
  tableFooter.hidden = tableFooter.rows.length === 0;
  footer.hidden = footer.childElementCount === 0 && !footer.textContent.trim();
  component.classList.add("ui-table-component");
  table.classList.add("ui-table");

  const tableComponent = Object.freeze({
    element: table,
    component,
    header,
    body,
    footer,
    head,
    rows,
    tableFooter,
    setColumnHeader(row) {
      head.replaceChildren(row);
    },
    setRows(content) {
      rows.replaceChildren(...Array.from(content));
    },
    setFooter(content) {
      const children = Array.from(content);
      footer.replaceChildren(...children);
      footer.hidden = children.length === 0;
    },
  });
  tableComponents.set(table, tableComponent);
  return tableComponent;
}

export function setupTableComponents(root) {
  return [...root.querySelectorAll("table")].map(createTableComponent);
}

function createTableWrapper(table) {
  const document = table.ownerDocument;
  const component = document.createElement("div");
  const header = document.createElement("header");
  const title = document.createElement("h2");
  const body = table.closest(".table-scroll") ?? table.parentElement;
  const footer = document.createElement("footer");
  component.className = "ui-table-component";
  header.className = "ui-table-header";
  title.className = "ui-table-title";
  title.textContent = table.caption?.textContent.trim() || "Table";
  header.append(title);
  footer.className = "ui-table-footer";
  footer.hidden = true;
  body.before(component);
  component.append(header, body, footer);
  return component;
}
