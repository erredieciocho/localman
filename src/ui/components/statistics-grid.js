const statisticsGrids = new WeakMap();

export function createStatisticsGridComponent(element) {
  if (!element || element.nodeType !== 1) {
    throw new TypeError("A statistics grid requires an element.");
  }
  const existing = statisticsGrids.get(element);
  if (existing) return existing;

  const values = new Map();
  element.classList.add("ui-statistics-grid");
  const component = Object.freeze({
    element,
    render(rows) {
      if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.length === 0)
        || rows.flat().some((metric) => !metric || typeof metric.title !== "string"
          || typeof metric.description !== "string")) {
        throw new TypeError("Statistics grid rows must be non-empty arrays of metrics.");
      }
      values.clear();
      element.replaceChildren(...rows.map((metrics) => {
        const row = element.ownerDocument.createElement("div");
        row.className = "statistics-grid-row";
        row.style.setProperty("--statistics-grid-count", metrics.length);
        row.dataset.count = String(metrics.length);
        for (const metric of metrics) {
          const item = element.ownerDocument.createElement("div");
          item.className = "statistics-grid-cell";
          const title = element.ownerDocument.createElement("span");
          title.className = "statistics-grid-title";
          title.textContent = metric.title;
          const value = element.ownerDocument.createElement("strong");
          value.textContent = String(metric.value ?? "");
          if (metric.id) {
            value.id = metric.id;
            values.set(metric.id, value);
          }
          const description = element.ownerDocument.createElement("small");
          description.className = "statistics-grid-description";
          description.textContent = metric.description;
          item.append(title, value, description);
          row.append(item);
        }
        return row;
      }));
      return component;
    },
    setValue(id, value) {
      const target = values.get(id);
      if (!target) throw new RangeError(`Statistics grid value "${id}" does not exist.`);
      target.textContent = String(value);
    },
  });
  statisticsGrids.set(element, component);
  return component;
}
