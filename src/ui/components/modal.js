const modalComponents = new WeakMap();

export function createModalComponent(dialog) {
  if (!dialog || dialog.localName !== "dialog") {
    throw new TypeError("A modal component requires a dialog element.");
  }
  const existing = modalComponents.get(dialog);
  if (existing) return existing;

  const document = dialog.ownerDocument;
  const header = dialog.querySelector(":scope > .ui-modal-header") ?? document.createElement("div");
  header.classList.add("ui-modal-header");
  let title = header.querySelector("h1, h2, h3, h4");
  if (!title) {
    title = document.createElement("h2");
    header.prepend(title);
  }
  title.id ||= dialog.getAttribute("aria-labelledby") || `${dialog.id}-title`;
  title.textContent ||= dialog.dataset.modalTitle || "";
  dialog.setAttribute("aria-labelledby", title.id);
  let closeButton = header.querySelector("button");
  if (!closeButton) {
    closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "button button-secondary";
    closeButton.textContent = dialog.dataset.modalCloseLabel || "Close";
    header.append(closeButton);
  }
  closeButton.id ||= dialog.dataset.modalCloseId || `${dialog.id}-close`;

  dialog.classList.add("ui-modal");
  if (!header.parentElement) dialog.prepend(header);
  header.classList.add("ui-table-header");
  if (dialog.querySelector("table")) dialog.classList.add("ui-table-component");
  closeButton.classList.add("ui-modal-close");
  closeButton.addEventListener("click", () => {
    if (dialog.open) dialog.close();
  });

  const component = Object.freeze({
    element: dialog,
    header,
    title,
    closeButton,
    show() {
      if (!dialog.open) dialog.showModal();
    },
    close() {
      if (dialog.open) dialog.close();
    },
  });
  modalComponents.set(dialog, component);
  return component;
}

export function setupModalComponents(root) {
  return [...root.querySelectorAll("dialog")].map(createModalComponent);
}
