const itemVariants = ["primary", "secondary", "tertiary", "secondary"];

export function createTreemapComponent(container, {
  sortButton,
  sortable = true,
  direction = 1,
  sortLabel = "items",
  renderItems = renderTreemap,
} = {}) {
  if (!container) {
    throw new TypeError("A treemap component requires a container element.");
  }
  if (sortable && !sortButton) {
    throw new TypeError("A sortable treemap component requires a sort button.");
  }
  let sortDirection = direction;
  let lastOptions = null;
  if (sortable) {
    sortButton.addEventListener("click", () => {
      sortDirection *= -1;
      if (lastOptions?.onSortChange) lastOptions.onSortChange(sortDirection);
      else renderLast();
    });
    updateSortButton();
  }

  function updateSortButton() {
    const largestFirst = sortDirection === 1;
    const largestIcon = sortButton.querySelector('[data-map-sort-icon="largest"], [data-treemap-sort-icon="largest"]');
    const smallestIcon = sortButton.querySelector('[data-map-sort-icon="smallest"], [data-treemap-sort-icon="smallest"]');
    if (largestIcon) largestIcon.hidden = !largestFirst;
    if (smallestIcon) smallestIcon.hidden = largestFirst;
    sortButton.setAttribute("aria-label",
      `Change ${sortLabel} sort order to ${largestFirst ? "smallest" : "largest"} first`);
    sortButton.title = largestFirst
      ? `Largest ${sortLabel} first; click to show smallest first`
      : `Smallest ${sortLabel} first; click to show largest first`;
  }

  function render(options) {
    lastOptions = options;
    renderLast();
  }

  function sortItems(items, options = lastOptions) {
    if (!sortable) return [...items];
    if (!options) {
      throw new TypeError("Sorting treemap items requires render options.");
    }
    const getSortValue = options.getSortValue ?? options.getValue;
    const compareItems = options.compareItems;
    return [...items].sort((left, right) => compareItems
      ? compareItems(left, right, sortDirection)
      : sortDirection * (getSortValue(right) - getSortValue(left))
        || options.getName(left).localeCompare(options.getName(right)));
  }

  function renderLast() {
    if (!lastOptions) {
      if (sortable) updateSortButton();
      return;
    }
    const items = sortItems(lastOptions.items);
    if (sortable) updateSortButton();
    renderItems(container, { ...lastOptions, items });
  }

  return Object.freeze({
    render,
    sortItems,
    get sortDirection() {
      return sortDirection;
    },
  });
}

export function renderTreemap(container, {
  items,
  getName,
  getValue,
  getDisplayValue = (item) => getValue(item).toLocaleString(),
  getItemClassName = () => "",
  getItemActionLabel,
  onItemAction,
  getOtherDisplayValue = (otherItems, total) => total.toLocaleString(),
  getItemTitle = (item) => `Open ${getName(item)}`,
  getOtherTitle = (otherItems) => `Show ${otherItems.length} other items`,
  onItem,
  onOther,
  emptyMessage,
  label,
  otherLabel = "Other",
  maximumItems = 9,
}) {
  container.replaceChildren();
  container.classList.toggle("treemap--has-other-items", items.length > maximumItems);
  if (!items.length) {
    const empty = container.ownerDocument.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    container.append(empty);
    container.removeAttribute("aria-label");
    return;
  }

  for (const [index, item] of items.slice(0, maximumItems).entries()) {
    const variantClassName = `treemap-item--${itemVariants[Math.min(index, itemVariants.length - 1)]}`;
    const itemClassName = getItemClassName(item);
    const button = container.ownerDocument.createElement("button");
    button.type = "button";
    button.className = [
      "treemap-item",
      variantClassName,
      itemClassName,
    ].filter(Boolean).join(" ");
    button.title = getItemTitle(item);
    const name = container.ownerDocument.createElement("span");
    name.className = "treemap-name";
    name.textContent = getName(item);
    const value = container.ownerDocument.createElement("span");
    value.className = "treemap-value";
    value.textContent = getDisplayValue(item);
    button.append(name, value);
    button.addEventListener("click", () => onItem(item));
    const actionLabel = getItemActionLabel?.(item);
    if (actionLabel && onItemAction) {
      const wrapper = container.ownerDocument.createElement("div");
      wrapper.className = [
        "treemap-item-action-wrapper",
        variantClassName,
        itemClassName,
      ].filter(Boolean).join(" ");
      const action = container.ownerDocument.createElement("button");
      action.type = "button";
      action.className = "treemap-item-action";
      action.textContent = "+";
      action.title = actionLabel;
      action.setAttribute("aria-label", actionLabel);
      action.addEventListener("click", () => onItemAction(item));
      wrapper.append(button, action);
      container.append(wrapper);
    } else {
      container.append(button);
    }
  }

  const otherItems = items.slice(maximumItems);
  if (otherItems.length) {
    const other = container.ownerDocument.createElement("button");
    other.type = "button";
    other.className = "treemap-item treemap-item--other";
    other.title = getOtherTitle(otherItems);
    const name = container.ownerDocument.createElement("span");
    name.className = "treemap-name";
    name.textContent = otherLabel;
    const value = container.ownerDocument.createElement("span");
    value.className = "treemap-value";
    const total = otherItems.reduce((sum, item) => sum + getValue(item), 0);
    value.textContent = getOtherDisplayValue(otherItems, total);
    other.append(name, value);
    other.addEventListener("click", () => onOther(otherItems));
    container.append(other);
  }

  container.setAttribute("aria-label", label);
}
