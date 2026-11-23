export function setupAbout(root, { location = root.ownerDocument?.defaultView?.location } = {}) {
  const tabs = [...root.querySelectorAll("[data-about-tab]")];
  if (!tabs.length) throw new Error("The About panel must contain at least one About tab.");
  const hostedLink = root.querySelector('a[href="https://erredieciocho.github.io/localman/"]');
  if (hostedLink && location) {
    const hostedUrl = new URL(hostedLink.href, location.href);
    hostedLink.hidden = location.hostname === hostedUrl.hostname
      && location.pathname.startsWith(hostedUrl.pathname);
  }

  const selectTab = (selectedTab) => {
    for (const tab of tabs) {
      const selected = tab === selectedTab;
      const panel = root.querySelector(`[data-about-panel="${tab.dataset.aboutTab}"]`);
      if (!panel) throw new Error(`The About tab "${tab.dataset.aboutTab}" has no panel.`);
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    }
  };

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[nextIndex].focus();
      selectTab(tabs[nextIndex]);
    });
  }

  selectTab(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0]);
}
