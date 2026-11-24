# Changelog

This document records meaningful project changes. Dates use the **DD/MM/YYYY** format. 

Entries are grouped by category and listed in chronological order (oldest first) within each category; add new entries at the end of the relevant category.

## Architecture and foundations

- **07/11/2026 – 09/11/2026** – Established the native HTML/CSS/JavaScript ES-module application and migrated the core localisation parsing/model and GUI workflows from the earlier desktop application, adding terminology, settings, dashboard, validation and supporting views.
- **11/11/2026** – Added a format-agnostic Core parser registry with content-based selection and explicit unsupported/ambiguous-format errors; CSV parsing, schema handling and serialisation now sit behind a registered CSV plugin.
- **11/11/2026** – Extracted the format-independent `LocalisationDocument` model into Core and grouped glossary, translation, spellcheck, validation and statistics code into domain modules with public APIs.
- **11/11/2026** – Added browser adapters for file picking, reading, writing, downloads and local storage, and moved dictionary loading out of Core.
- **11/11/2026** – Added a UI-neutral localisation service that coordinates parsing with file loading, Save, Export and section import; file handles and unsaved-change tracking stay private to it.
- **11/11/2026** – Deferred Dashboard, Editor, Terminology and Settings initialisation until first activation.
- **11/11/2026** – Extracted reusable treemap, table and native-dialog components, plus shared table cells, and reused them across views.
- **12/11/2026** – Added a reusable configurable statistics-grid component for Dashboard metadata and metrics.
- **14/11/2026** – Made treemap sorting configurable in the shared component, and made shared table headers use only their occupied regions.

## File handling and CSV

- **07/11/2026 – 09/11/2026** – Added explicit Save and separate-copy Export workflows with unsaved-change protection, section import/export, and original CSV line indexes.
- **12/11/2026** – Exposed the file encoding and BOM in Dashboard metadata, and preserved UTF-8, UTF-16LE and UTF-16BE through Save, Export, section Export and reload; unsupported UTF-32 and invalid input now give clear errors.
- **14/11/2026** – Added a section-export modal with a read-only preview and Download, using one payload for both to preserve encoding.
- **23/11/2026** – Accepted horizontal whitespace after a quoted CSV field, including non-breaking spaces, while preserving the original record.
- **23/11/2026** – Stored localisation and custom-dictionary file handles in IndexedDB where supported and restored them on startup, reporting inaccessible handles through notifications (Compare targets are not retained). Startup no longer requests permission itself; a "Restore last file" action does so from the user's click.
- **24/11/2026** – CSV errors now include the Unicode code point of the unexpected character, so invisible characters after closing quotes can be identified.

## Editor

- **07/11/2026 – 09/11/2026** – Added exact and fuzzy translation suggestions for untranslated entries, find-and-replace and editable metadata sections; improved section navigation, sorting, filtering and rendering performance.
- **14/11/2026** – Moved Find and Replace below the Editor header and row warnings after the entry index text.
- **15/11/2026** – Showed the longest original sentence beside the maximum-length setting and added a modal summarising YEP/Yanfly Message Core text escape codes.
- **16/11/2026** – Linked the longest original sentence's section and entry in Settings directly to its Editor row.
- **23/11/2026** – Added Find All highlighting and Enter-triggered Find Next.

## Spellcheck and dictionaries

- **07/11/2026 – 09/11/2026** – Added Typo.js dictionary spellchecking with issue reporting, reusing spelling status in Dashboard word usage.
- **14/11/2026** – Treated excluded words as not spellchecked (and left them out of the OK/Not OK filters); added accessible dictionary status indicators.
- **15/11/2026** – Added an action on Not OK Dashboard words (hover/keyboard-revealed, always visible on touch) to add them to the persisted exclusion list, and a Settings action to export the list as a UTF-8 text file.
- **23/11/2026** – Added session-only custom dictionary import for AFF+DIC pairs and OXT, XPI or ZIP packages, which replace the active dictionary for the selected language.
- **23/11/2026** – Exclusion imports now append unique words, with a clear-list action; exclusion actions update the word treemap and QA records incrementally.
- **23/11/2026** – Spellcheck now tries variants for initial-letter stutters (such as `o-okay`) and elongated letter runs, retaining the original token for reporting.
- **24/11/2026** – Added bundled dictionaries for French, German, Portuguese (Portugal), Polish, Russian and Korean. Italian and Dutch are deferred because their affix and compound rules exceed the loader's time limit; Japanese and Chinese remain deferred for compatibility.
- **24/11/2026** – Showed distinct entry counts for bundled and custom dictionaries, with an expandable list of the selected dictionary's entries.

## Dashboard and analysis

- **07/11/2026 – 09/11/2026** – Added translation statistics, map/section analysis, Source-tag usage and target-language word usage, with configurable section-progress and word-usage filters, map complexity ranking modes, Source-tag pagination and linked occurrence dialogues.
- **11/11/2026** – Map complexity tiles and detail tables now show entry and unique-word counts.
- **12/11/2026** – Replaced the glossary-only Source-tag popup with a shared detail view showing original and translated names, per-map entry frequency and entry text, with independently paginated lists (25 per page).
- **14/11/2026** – Sorted target-language words before pagination in the colour-coded treemap, and made Source-tag occurrence sorting reversible.
- **15/11/2026** – Showed two-decimal complexity scores in map tiles and the Other maps table.
- **16/11/2026** – Added a map-issue ranking mode synchronised with unresolved QA counts.
- **23/11/2026** – Merged translation statistics and the localisation overview into one grid with themed status and threshold-based progress colours; the complexity treemap's Other tile now shows its map count.
- **24/11/2026** – Added a total-section count (including unnamed sections) and compared distinct English source and selected target words in the overview, colouring the larger count green, the smaller red, and leaving ties in the default colour.

## Terminology, Maps and Compare

- **14/11/2026** – Replaced the Terminology table with a filterable two-pane term list and detail view with independent source/target map tables (25 maps per page); repeated names and descriptions sharing an ID are merged in source order.
- **14/11/2026** – Added a searchable Maps catalogue backed by a local JSON asset, with episode and route filters and selected-map details; available before a file is opened.
- **14/11/2026** – Added Compare for the open file and a separately selected CSV: it matches sections and IDs (preserving duplicate-ID order), highlights changed fields side by side and reports extra or missing entries, in collapsible sections paginated in groups of 10.
- **15/11/2026** – Added per-map summary, progress, complexity, entry statistics, paginated localisation rows and Editor navigation to Maps, and moved Maps after Terminology.
- **15/11/2026** – Added map, Source-tag and entry-ID navigation across Dashboard, Maps, Compare and Terminology; Source-tag details can open matching glossary definitions.
- **15/11/2026** – Replaced map confidence metadata with ending names, highlighted ending-associated maps and restyled route tags.
- **16/11/2026** – Added a Maps legend for ending colours and a heading action listing unique endings with excerpts from their map summaries.
- **23/11/2026** – Kept lowercase continuation text after quoted question marks in game-ending summaries (e.g. Map214's “Any regrets?”).

## QA and validation

- **16/11/2026** – Added grouped QA issue review with a type legend, search and resolution filters, per-issue and per-section resolution controls, and versioned JSON import/export; QA is available only when a file is open.
- **16/11/2026** – Persisted resolved issue references in local storage independently of file identity and restored them for matching issues.
- **16/11/2026** – Presented issues in a compact responsive card grid (two rows, scrolling horizontally) under section groups of 10 per page with issue-share percentages; section actions sit in group summaries, counts in the heading, and expanded sections stay open when issues are resolved or unresolved.
- **16/11/2026** – Disabled glossary-term validation by default (the setting is retained).
- **18/11/2026** – Added live per-type issue counts to the legend.
- **23/11/2026** – Editor warning icons now open the matching expanded QA section, on the correct page and filtered to the selected entry ID; removed the redundant issue modal and the Editor Issues section.
- **23/11/2026** – Moved QA counts into a Summary with interactive issue-type filters, grouped legend styling and red theme-aware count badges.

## Settings

- **14/11/2026** – Added category tabs, validated JSON import/export for preferences, theme and Source-tag colours, global table-density controls (under Appearance), palette randomisation, muted Source-tag colours and contrast-aware tag text.
- **15/11/2026** – Moved dictionary controls into a dedicated Dictionary tab.
- **23/11/2026** – Moved browser spellcheck to the Editor tab; grouped dictionary settings with custom imports in the dictionary dropdown; separated dictionary exclusions into their own group with import, export, clear and a scrollable preview kept in sync with Dashboard actions; Source-tag colour controls are disabled until a file is open.

## Interface and visual design

- **07/11/2026 – 09/11/2026** – Consolidated the UI around a consistent design language with light/dark themes, responsive layout, unified progress bars, treemap visualisations and a project-owned favicon.
- **14/11/2026** – Structured table headers into left, centre and right regions with responsive stacking, aligned progress bars and labels, compacted table controls, and clarified sortable headings with bidirectional indicators and better contrast.
- **16/11/2026** – Added the `localman.png` header logo, grouped tab separators, navigation descriptions, and live availability indicators and tooltips.
- **18/11/2026** – Added visible success and detailed error confirmations for Save.
- **23/11/2026** – Replaced message-oriented dialogs with accessible bottom-right toasts (success and warning auto-dismiss; errors and confirmations persist; at most five visible), routing file, settings, QA, configuration and Source-tag feedback through them while keeping detail and selection dialogs and the unsaved-changes safeguard.
- **24/11/2026** – Grouped related actions into joined button pairs with dynamic Restore and conditional-export visibility; made the tab strip scroll internally; moved dictionary and offline status indicators to Settings → Dictionary and About → Offline with consistent green/yellow/red styling.

## Offline support, About and hosting

- **18/11/2026** – Added offline PWA support: standalone-app metadata and service-worker caching of the app shell, map catalogue, libraries and bundled dictionaries, with offline fallback. Split About into feature, offline-installation and changelog tabs.
- **23/11/2026** – Renamed the About installation tab to Offline, added desktop, Android and iOS installation instructions and a local Python-server alternative, and reported unsupported/not-ready, installable and standalone states above the instructions.
- **23/11/2026** – Added repository and hosted-site links at the top of About and replaced the Changelog tab with a link opening `docs/changelog.md` in a new tab.
- **23/11/2026** – Hid the hosted-site link on GitHub Pages.
- **24/11/2026** – Fixed the hosted-site link so its hidden state overrides its flex styling, and added a browser regression check for visibility on the hosted site and in local development.

## Testing and documentation

- **07/11/2026 – 09/11/2026** – Added a browser-based core test harness.
- **11/11/2026** – Added component regression coverage.