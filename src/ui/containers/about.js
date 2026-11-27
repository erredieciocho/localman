import { createModalComponent } from "../components/modal.js";

export function setupAbout(root, { location = root.ownerDocument?.defaultView?.location } = {}) {
  const tabs = [...root.querySelectorAll("[data-about-tab]")];
  if (!tabs.length) throw new Error("The About panel must contain at least one About tab.");
  const hasVersionTab = tabs.some((tab) => tab.dataset.aboutTab === "version");
  const versionStatus = root.querySelector("#about-version-status");
  const versionNumber = root.querySelector("#about-version-number");
  const versionDate = root.querySelector("#about-version-date");
  const formatSupportRows = root.querySelector("#about-version-supported");
  const markdownResources = [
    {
      button: root.querySelector("#about-credits-button"),
      dialog: createModalComponent(root.querySelector("#about-credits-dialog")),
      content: root.querySelector("#about-credits-content"),
      status: root.querySelector("#about-credits-status"),
      url: new URL("../../../credits.md", import.meta.url),
    },
    {
      button: root.querySelector("#about-changelog-button"),
      dialog: createModalComponent(root.querySelector("#about-changelog-dialog")),
      content: root.querySelector("#about-changelog-content"),
      status: root.querySelector("#about-changelog-status"),
      url: new URL("../../../docs/changelog.md", import.meta.url),
    },
  ];
  const markdownCache = new Map();
  const markdownRequests = new Map();
  if (hasVersionTab && (!versionStatus || !versionNumber || !versionDate || !formatSupportRows)) {
    throw new Error("The Version tab is missing its version details or supported-formats table.");
  }
  let versionLoaded = false;
  let versionRequest = null;
  const hostedLink = root.querySelector('a[href="https://erredieciocho.github.io/localman/"]');
  if (hostedLink && location) {
    const hostedUrl = new URL(hostedLink.href, location.href);
    hostedLink.hidden = location.hostname === hostedUrl.hostname
      && location.pathname.startsWith(hostedUrl.pathname);
  }

  for (const resource of markdownResources) {
    if (!resource.button || !resource.content || !resource.status) {
      throw new Error("The About panel is missing a Markdown resource button or content container.");
    }
    resource.button.addEventListener("click", () => {
      resource.dialog.show();
      void loadMarkdown(resource);
    });
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
    if (selectedTab.dataset.aboutTab === "version") void loadVersion();
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

  async function loadVersion() {
    if (versionLoaded || versionRequest || !hasVersionTab) return;
    versionStatus.textContent = "Loading version information...";
    versionRequest = (async () => {
      const fetcher = root.ownerDocument.defaultView?.fetch;
      if (typeof fetcher !== "function") {
        throw new Error("Fetching version information is unavailable in this browser.");
      }
      const [versionInfo, pluginManifest] = await Promise.all([
        fetchJson(fetcher, new URL("../../../version.json", import.meta.url), "version file"),
        fetchJson(fetcher, new URL("../../plugins/manifest.json", import.meta.url), "plugin manifest"),
      ]);
      validateVersionInfo(versionInfo);
      const supportedFormats = validatePluginManifest(pluginManifest);
      versionNumber.textContent = versionInfo.version;
      versionDate.textContent = versionInfo.date;
      const [day, month, year] = versionInfo.date.split("/");
      versionDate.dateTime = `${year}-${month}-${day}`;
      formatSupportRows.replaceChildren(...supportedFormats.map(({
        codename,
        gameName,
        format,
        description,
        versions,
        readonly,
      }) => {
        const row = root.ownerDocument.createElement("tr");
        const codenameCell = root.ownerDocument.createElement("th");
        codenameCell.scope = "row";
        codenameCell.textContent = `[${codename}] ${gameName}`;
        const formatCell = root.ownerDocument.createElement("td");
        formatCell.textContent = `[${format}] ${description}`;
        const versionsCell = root.ownerDocument.createElement("td");
        versionsCell.textContent = versions.join(", ");
        const modeCell = root.ownerDocument.createElement("td");
        modeCell.textContent = readonly ? "Read-only" : "Editable";
        row.append(codenameCell, formatCell, versionsCell, modeCell);
        return row;
      }));
      versionStatus.textContent = "";
      versionStatus.hidden = true;
      versionLoaded = true;
    })().catch((error) => {
      const details = error instanceof Error ? error.message : String(error);
      versionStatus.textContent = `Could not load version information: ${details}`;
    }).finally(() => {
      versionRequest = null;
    });
    await versionRequest;
  }

  async function loadMarkdown(resource) {
    if (markdownCache.has(resource.url.href)) {
      renderMarkdown(resource.content, markdownCache.get(resource.url.href));
      resource.status.hidden = true;
      return;
    }
    if (markdownRequests.has(resource.url.href)) {
      await markdownRequests.get(resource.url.href);
      return;
    }

    resource.status.hidden = false;
    resource.status.textContent = "Loading content…";
    const fetcher = root.ownerDocument.defaultView?.fetch;
    if (typeof fetcher !== "function") {
      resource.status.textContent = "Markdown content could not be loaded: Fetching is unavailable in this browser.";
      return;
    }
    const request = (async () => {
      const response = await fetcher(resource.url);
      if (!response.ok) {
        throw new Error(`The Markdown file could not be loaded (HTTP ${response.status}).`);
      }
      const markdown = await response.text();
      renderMarkdown(resource.content, markdown);
      markdownCache.set(resource.url.href, markdown);
      resource.status.hidden = true;
    })().catch((error) => {
      const details = error instanceof Error ? error.message : String(error);
      resource.status.textContent = `Markdown content could not be loaded: ${details}`;
    }).finally(() => {
      markdownRequests.delete(resource.url.href);
    });
    markdownRequests.set(resource.url.href, request);
    await request;
  }
}

async function fetchJson(fetcher, url, resourceName) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`The ${resourceName} could not be loaded (HTTP ${response.status}).`);
  }
  return response.json();
}

function validateVersionInfo(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)
    || typeof data.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(data.version)
    || typeof data.date !== "string" || !isValidDate(data.date)) {
    throw new Error("The version file has an invalid structure.");
  }
}

function validatePluginManifest(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The plugin manifest has an invalid structure.");
  }
  const supportedFormats = [];
  for (const [codename, game] of Object.entries(data)) {
    if (!codename.trim() || !game || typeof game !== "object" || Array.isArray(game)
      || typeof game.name !== "string" || !game.name.trim()
      || !game.formats || typeof game.formats !== "object" || Array.isArray(game.formats)) {
      throw new Error(`The plugin manifest details for "${codename}" are invalid.`);
    }
    const formats = Object.entries(game.formats);
    if (formats.length === 0) {
      throw new Error(`The plugin manifest does not list any formats for "${codename}".`);
    }
    for (const [format, details] of formats) {
      if (!format.trim() || !details || typeof details !== "object" || Array.isArray(details)
        || typeof details.name !== "string" || !details.name.trim()
        || typeof details.description !== "string" || !details.description.trim()
        || typeof details.readonly !== "boolean"
        || !isStringList(details.versions)
        || !details.versions.every(isSupportedVersionPattern)) {
        throw new Error(`The plugin manifest details for "${codename}" format "${format}" are invalid.`);
      }
      supportedFormats.push({
        codename,
        gameName: game.name,
        format,
        description: details.description,
        versions: details.versions,
        readonly: details.readonly,
      });
    }
  }
  if (supportedFormats.length === 0) {
    throw new Error("The plugin manifest does not list any supported formats.");
  }
  return supportedFormats;
}

function isStringList(values) {
  return Array.isArray(values) && values.length > 0
    && values.every((value) => typeof value === "string" && value.trim().length > 0);
}

function isSupportedVersionPattern(value) {
  return value === "*" || /^\d+\.\*$/u.test(value) || /^\d+\.\d+\.\d+$/u.test(value);
}

function isValidDate(value) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  if (!match) return false;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day
    && date.getUTCMonth() === month - 1
    && date.getUTCFullYear() === year;
}

function renderMarkdown(container, markdown) {
  const document = container.ownerDocument;
  const fragment = document.createDocumentFragment();
  let paragraph = [];
  let list = null;
  let listType = "";
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const element = document.createElement("p");
    appendInlineMarkdown(element, paragraph.join(" "), document);
    fragment.append(element);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    fragment.append(list);
    list = null;
    listType = "";
  };

  for (const line of markdown.replace(/\r\n?/gu, "\n").split("\n")) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/u);
    if (heading) {
      flushParagraph();
      flushList();
      const element = document.createElement(`h${heading[1].length}`);
      appendInlineMarkdown(element, heading[2], document);
      fragment.append(element);
      continue;
    }
    const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/u);
    const orderedItem = line.match(/^\s*\d+\.\s+(.+)$/u);
    const itemText = unorderedItem?.[1] ?? orderedItem?.[1];
    if (itemText) {
      flushParagraph();
      const nextType = unorderedItem ? "ul" : "ol";
      if (listType !== nextType) {
        flushList();
        list = document.createElement(nextType);
        listType = nextType;
      }
      const item = document.createElement("li");
      appendInlineMarkdown(item, itemText, document);
      list.append(item);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  container.replaceChildren(fragment);
}

function appendInlineMarkdown(container, text, document) {
  const expression = /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/gu;
  let previousIndex = 0;
  for (const match of text.matchAll(expression)) {
    const index = match.index ?? 0;
    if (index > previousIndex) container.append(document.createTextNode(text.slice(previousIndex, index)));
    const [, linkText, href, boldA, boldB, code, emphasisA, emphasisB] = match;
    if (linkText) {
      const link = document.createElement("a");
      link.textContent = linkText;
      try {
        const url = new URL(href, document.baseURI);
        if (url.protocol === "https:" || url.protocol === "http:") {
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        } else {
          link.textContent = `${linkText} (${href})`;
        }
      } catch {
        link.textContent = `${linkText} (${href})`;
      }
      container.append(link);
    } else if (boldA || boldB) {
      const strong = document.createElement("strong");
      strong.textContent = boldA ?? boldB;
      container.append(strong);
    } else if (code) {
      const inlineCode = document.createElement("code");
      inlineCode.textContent = code;
      container.append(inlineCode);
    } else {
      const emphasis = document.createElement("em");
      emphasis.textContent = emphasisA ?? emphasisB;
      container.append(emphasis);
    }
    previousIndex = index + match[0].length;
  }
  if (previousIndex < text.length) container.append(document.createTextNode(text.slice(previousIndex)));
}
