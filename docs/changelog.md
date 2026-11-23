# Changelog

This document records meaningful project changes and must be updated after each development session; only relevant changes should be included. 

It is intended to provide a high-level overview of the project history.

## Historical development (07/11/2026 - 09/11/2026)

### Initial web migration
- Established the native HTML/CSS/JavaScript ES-module application structure.
- Migrated core localisation parsing/model functionality and GUI workflows from the earlier desktop application.
- Added terminology, settings, dashboard, validation and supporting application views.
- Added a browser-based core test harness.

### Editor and data-handling enhancements
- Added Typo.js-based dictionary spellchecking and issue reporting.
- Added exact and fuzzy translation suggestions for untranslated entries.
- Added section import/export, find-and-replace, editable metadata sections and original CSV line indexes.
- Added explicit Save and separate-copy Export workflows, plus unsaved-change protection.
- Improved section navigation, sorting, filtering and editor rendering performance.

### Dashboard and analysis enhancements
- Added translation statistics, map/section analysis, source-tag usage and target-language word usage.
- Added configurable section-progress filtering and word-usage filters.
- Added spelling-status reuse between issue reporting and Dashboard word usage.
- Added map complexity ranking modes, source-tag pagination and linked occurrence dialogues.

### Visual improvements
- Consolidated the UI around a consistent design language.
- Added light/dark themes, responsive layout refinements, unified progress bars and treemap-based visualisations.
- Added a project-owned favicon.

## Documentation baseline

- Added root `AGENTS.md` to consolidate agent workflow, implementation constraints, data-integrity rules and documentation expectations.

## Current Development (07/11/2026 - Today)

### Notification toasts (23/11/2026)
- Replaced message-oriented error and file-required dialogs with accessible bottom-right notifications; success and warning toasts auto-dismiss, while errors and confirmations remain until dismissed.
- Routed file, settings, QA, configuration and Source-tag feedback through toasts while preserving detail and selection dialogs and the unsaved-changes safeguard.
- Verified all 50 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### Offline installation guidance (23/11/2026)
- Renamed the About installation tab to Offline, added concise desktop, Android and iOS installation instructions, and documented the local Python-server alternative.
- Moved the status above the instructions and report unsupported/not-ready states, browser-reported installability and detected standalone installation.
- Verified all 50 UI workflow tests on desktop and mobile, then confirmed install-state updates and an offline reload in Edge.

### About links (23/11/2026)
- Added repository and hosted-site links to About, and replaced the compact Changelog tab with a new-tab link to `docs/changelog.md`.
- Verified the About navigation and link destinations in all 50 desktop and mobile UI workflow tests.

### User Interface completion (23/11/2026)
- Disabled Source-tag colour controls until a localisation file is open, changed the complexity treemap's Other tile to show its map count, and moved QA counts into a Summary with interactive issue-type filters.
- Verified all 50 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths; the User Interface stage is complete.

### Settings refinements (23/11/2026)
- Moved browser spellcheck to the Editor settings tab; renamed the group Dictionary and integrated custom dictionary imports into its dropdown for supported packages or AFF+DIC pairs, with no separate import button.
- Separated dictionary exclusions into their own group with import, export and clear actions plus a scrollable preview that stays in sync with saved exclusions and Dashboard actions.
- Kept the empty Source-tags preview compact so its guidance remains visible without extra scrolling.
- Merged translation statistics and localisation overview into one grid with themed status colours and threshold-based progress colours.
- Removed the Editor Issues section; QA is the issue review surface, while Editor warning icons continue to navigate to relevant QA entries.
- Verified all 50 UI workflow tests at desktop and mobile widths.

### CSV parser interoperability (23/11/2026)
- Accepted horizontal whitespace after a quoted CSV field as part of its value, preserving that content and the original raw record; added coverage for line 15087.
- Verified all 32 Core tests. Physical iOS/Safari reproduction was unavailable in this environment.

### Bug fixes (23/11/2026)
- Made dictionary exclusion actions update the cached word treemap and QA records incrementally, avoiding redundant validation, inactive Editor redraw and unnecessary map-ranking redraws.
- Kept lowercase continuation text after quoted question marks in game-ending summaries, including the Map214 “Any regrets?” prompt.
- Measured a 2.7 ms exclusion click with 1,200 unique misspellings in Edge; verified 50 UI workflow tests at desktop and mobile sizes and all 32 Core tests.

### Entry-specific QA navigation (23/11/2026)
- Editor warning icons now filter QA issues to the selected entry ID while retaining section expansion and page navigation.
- Verified all 50 UI workflow tests at desktop and mobile sizes.

### QA and notification styling (23/11/2026)
- Added spacing and a grouped surface to the QA summary legend, red theme-aware count badges and underlined statistics-grid titles.
- Limited visible notifications to five, removing the oldest when necessary, and added theme-aware confirmation styling.
- Verified all 50 UI workflow tests at desktop and mobile sizes.

### About links (23/11/2026)
- Moved the changelog to a non-selectable About tab link that opens in a new browser tab, and placed GitHub repository and hosted-site social links at the top of About.
- Verified all 50 UI workflow tests at desktop and mobile sizes.

### Functionality refinements (16/11/2026)
- Disabled glossary-term validation by default while preserving the user-controlled setting.
- Identified the longest original sentence's section and entry in Settings and linked directly to that Editor row.
- Verified all 43 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### Navigation and map presentation (16/11/2026)
- Added a disabled QA navigation placeholder, grouped tab separators and green/red availability indicators; Editor entry IDs are now plain text.
- Placed the favicon in the LOCALMAN heading and added a Maps legend for ending-associated map colours.
- Added a Maps heading action that lists unique endings with concise excerpts from their associated map summaries.

### Parser plugin boundary (11/11/2026)
- Added a format-agnostic Core parser registry with content-based selection and explicit unsupported/ambiguous format errors.
- Moved CSV parsing, localisation-version/schema handling and document/section serialization behind a statically registered CSV plugin; application file workflows now use the registry.
- Kept the existing localisation model and round-trip behavior in place while recording its extraction into format-independent Core modules as a later migration stage.

### Core domain modules (11/11/2026)
- Extracted the format-independent `LocalisationDocument` model into Core and kept CSV records and round-trip state private to the CSV plugin.
- Grouped glossary, translation, spellcheck, validation and statistics/word-usage code into domain modules with public entry points.
- Updated Core and UI consumers to use domain APIs; preserved original CSV line indexes and adjusted bundled dictionary asset paths for the moved spellcheck module.

### Platform adapters (11/11/2026)
- Added browser adapters for file picking, reading, writing, downloads and local-storage access; routed editor imports, file controls, settings, theme preferences and Source-tag colours through them.
- Moved dictionary loading and bundled dictionary fetching out of Core spellcheck, leaving Core responsible for dictionary-independent text preparation.
- Verified all 27 core tests and the file, save/export safety, and persistence UI workflows. The UI workflow harness passed 27 of 30 tests; its 3 known failures remain tracked for review after restructuring.

### Application services (11/11/2026)
- Added a UI-neutral localisation service that coordinates parser/plugin operations with file loading, Save, Export and section import through the platform file-system adapter.
- Kept writable browser file handles and unsaved-change tracking private to the service; the UI receives document, filename and save-capability data.
- Verified the application service in a DOM-free Web Worker, all 28 core tests, and existing file workflow coverage; the same 3 unrelated UI workflow failures remain tracked.

### UI containers and components (11/11/2026)
- Deferred Dashboard, Editor and Terminology initialization until first activation while retaining each initialized view and its local state.
- Added shared table text/action cells and empty-message rows, reused by Dashboard, Terminology, Issues and Occurrences.
- Verified all 28 core tests and 27 of 30 UI workflow tests; the same 3 previously tracked UI failures remained.

### Reusable presentation components (11/11/2026)
- Extracted a feature-neutral treemap renderer, a table component with separate header/body/footer regions, and a standard native-dialog component into dedicated UI modules.
- Reused the table and modal components across Dashboard, Editor, Terminology, Issues and Occurrences, and moved their shared styles into component stylesheets.
- Added component regression coverage; all 32 UI workflow tests and 28 core tests passed.

### Integration and bug fixes (11/11/2026)
- Deferred Settings control initialization until first activation while loading and applying persisted preferences at startup.
- Restored selected-section context in the Editor table caption and made map complexity tiles and detail tables show entry and unique-word counts.
- Routed section exports through the browser file-system adapter so the default browser download works without an injected downloader.
- Confirmed Core parser, statistics, glossary and validation operations run in a Web Worker without a DOM.
- Verified all 28 core tests and 31 UI workflow tests.

### Dashboard detail and metric-grid enhancements (12/11/2026)
- Replaced the glossary-only Source-tag popup with a shared detail view showing original and translated names, per-map entry frequency, and original/translated entry text; map and entry lists paginate independently with a 25-item limit.
- Added a reusable configurable statistics-grid component for Dashboard metadata and metrics, with variable cells per row, consistent title/value/description hierarchy, and row/cell separators.
- Verified all 33 UI workflow tests, including independent map and entry pagination beyond 25 items.

### File encoding preservation (12/11/2026)
- Exposed the source file encoding and BOM in Dashboard metadata, and preserved UTF-8, UTF-16LE and UTF-16BE through Save, Export, section Export and reload.
- Added clear errors for unsupported UTF-32 and invalid encoded input; verified the Core and UI browser harnesses.

### Visual consistency refinements (14/11/2026)
- Aligned treemap sorting with its title, compacted table controls, and structured table headers into left, centre and right regions with responsive stacking.
- Unified progress-bar dimensions and aligned progress labels; placed Editor row warnings after the entry index text.
- Verified all 34 UI workflow tests at desktop and mobile widths.

### Treemap and section-export enhancements (14/11/2026)
- Made sorting configurable in the shared treemap component and sorted target-language words before paginating the colour-coded treemap.
- Added a section-export modal with a read-only text preview and Download control, using one prepared payload for preview and download to preserve encoding.
- Verified all 29 Core tests and all 34 UI workflow tests at desktop and mobile widths.

### Terminology redesign (14/11/2026)
- Replaced the terminology table with a filterable two-pane term list and selected-term detail view, including independent source/target map tables with 25-map pagination.
- Merged repeated term names and descriptions sharing an ID in source order with spaces; retained occurrence navigation and definition links.
- Verified all 30 Core tests and all 35 UI workflow tests at desktop and mobile widths.

### Dashboard and table-header refinements (14/11/2026)
- Moved target-language word pagination into the right header region and placed Editor Find and Replace below its header with a separator.
- Made shared table headers use only their occupied regions, including a two-region Terminology browser header.
- Added reversible Source-tag occurrence sorting through the shared treemap component while retaining tag-only clicks, existing tile rendering and pagination.
- Verified all 30 Core tests and all 35 UI workflow tests at desktop and mobile widths.

### Settings, configuration and validation improvements (14/11/2026)
- Added category tabs to Settings, line-separated dictionary exclusions, and validated JSON import/export for preferences, theme and Source-tag colours.
- Added global table-density controls with compact defaults outside the Editor, palette randomisation, muted Source-tag colours, contrast-aware tag text and accessible dictionary status indicators.
- Excluded words are treated as not spellchecked; improved clickable table-heading contrast and removed the redundant Dashboard target-language label.
- Verified all 35 UI workflow tests. The Core browser harness reached dictionary loading but did not complete in the available headless environment.

### Compare and interface refinements (14/11/2026)
- Added Compare for the open file and a separately selected target CSV. It matches sections and IDs, preserves duplicate-ID order, highlights changed fields side by side, and reports extra or missing entries.
- Moved table density to Appearance, styled Settings actions, clarified sortable headings, removed redundant Issues dictionary text, bolded section-progress counts, and added a responsive About feature grid with updated instructions.
- Verified all 36 UI workflow tests at desktop and mobile widths. The Core browser harness remained at dictionary loading in headless Edge.

### Interface finishing refinements (14/11/2026)
- Hid visible file-operation status while retaining its accessible live region; added a bidirectional indicator to unsorted sortable headings.
- Corrected About and Source-tag palette spacing, and made Compare difference sections collapsible and paginated in groups of up to 10.

### Maps catalogue and final UI refinements (14/11/2026)
- Added a searchable Maps catalogue backed by the local JSON asset, with episode and route filters and selected-map details; Maps is available before a localisation file is opened.
- Kept sortable arrows separate from underlined labels, removed redundant Settings and colour-status helper text, and excluded unspellchecked words from the OK and Not OK word filters.
- Verified all 39 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### Dashboard exclusion actions (15/11/2026)
- Added a hover- and keyboard-revealed action to Not OK target-language words (always visible on touch devices), adding selected words to the persisted dictionary exclusion list.

### Dictionary exclusion export (15/11/2026)
- Added a Settings action beside exclusion-list import to download the current list as a line-separated UTF-8 text file.

### Map analysis and Compare refinements (15/11/2026)
- Displayed two-decimal complexity scores in Dashboard map tiles and the Other maps table; added per-map summary, progress, complexity, entry statistics, paginated localisation rows and Editor navigation to Maps.
- Added inset padding to Compare difference cards.
- Verified all 40 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### Cross-view navigation and settings refinements (15/11/2026)
- Moved Maps after Terminology, placed primary map and definition actions in their detail headers, and removed redundant term-detail controls.
- Added map, Source-tag and entry-ID navigation across Dashboard, Maps, Compare, Terminology, and their detail and occurrence views; Source-tag details can open matching glossary definitions in Terminology.
- Moved dictionary-related controls into a dedicated Dictionary settings tab.
- Verified all 42 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### Map endings and Editor guidance (15/11/2026)
- Placed the Source-tag Terminology action immediately before Close at the top right of the details header; it remains disabled when no glossary definition matches.
- Replaced map confidence metadata with ending names, highlighted ending-associated maps and restyled route tags.
- Displayed the longest original sentence beside the maximum-length setting and added an Editor modal summarising YEP/Yanfly Message Core text escape codes.
- Verified all 42 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### QA and navigation completion (16/11/2026)
- Added grouped QA issue review with a type legend, search and resolution filters, per-issue and per-section resolution controls, and versioned JSON import/export that ignores missing-entry references.
- Enabled QA only when a localisation file is open; added navigation descriptions and live availability tooltips, with yellow/green/red Maps status and no status dots on Settings or About.
- Added the `localman.png` header logo while retaining the favicon beside the LOCALMAN heading.
- Verified all 31 Core tests and all 45 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### QA persistence and review refinements (16/11/2026)
- Persisted resolved QA issue references in local storage independently of file identity, restored matching issues for the open file, and synchronised unresolved counts with a new Dashboard map-issue ranking mode.
- Styled QA counts and issue cards, added resolved/unresolved icon actions, and paginated section groups at 25 per page with issue-share percentages.
- Verified all 31 Core tests and all 46 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### QA review and Editor issue synchronisation (16/11/2026)
- Reworked QA issue cards into a compact responsive grid, moved section actions into group summaries, and placed unresolved, resolved and total counts in the panel heading.
- Reduced QA pagination to 10 sections per page and synchronised resolved/unresolved QA changes with the Editor issue list and row warnings.
- Verified all 46 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### QA issue-list scrolling (16/11/2026)
- Limited each section's QA issue-card grid to two rows, with horizontal scrolling for additional cards.
- Verified all 47 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### QA section state preservation (16/11/2026)
- Preserved expanded QA sections when individual issues or whole sections are marked resolved or unresolved.
- Verified all 47 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.

### Offline PWA support (18/11/2026)
- Added standalone-app metadata and service-worker caching for the full application shell, map catalogue, vendored libraries and bundled dictionaries, with cached navigation and asset fallback when offline.
- Verified all app files are included in the offline precache, all 48 UI workflow tests pass, and the installed app loads map data and bundled dictionaries with network access disabled.

### QA counts, About tabs and Save feedback (18/11/2026)
- Added live per-type issue counts to the QA legend and split About into feature, offline-installation and compact changelog tabs.
- Added visible success and detailed error confirmations for Save while retaining the existing error dialog.
- Verified all 48 UI workflow tests at desktop (1280x1000) and mobile (390x844), and confirmed the app shell, 194-map catalogue and Spanish dictionary load after an offline reload.

### Custom dictionary imports (23/11/2026)
- Added session-only custom dictionary import for AFF+DIC pairs and OXT, XPI or ZIP packages; custom dictionaries replace the active dictionary for the selected language without being saved in browser storage.
- Verified custom ZIP and AFF+DIC imports in the UI workflow suite.

### Dictionary exclusion management (23/11/2026)
- Changed exclusion imports to append unique words instead of replacing existing entries, and added a clear-list action.
- Verified appending, case-insensitive duplicate skipping, clearing and export in the UI workflow suite.

### QA warning navigation (23/11/2026)
- Changed Editor warning icons to open the corresponding expanded QA section, selecting its page when the issue list is paginated; removed the redundant issue modal.
- Verified warning navigation and page selection in the UI workflow suite.

### Spellcheck stutter and elongation handling (23/11/2026)
- Spellcheck now tries bounded variants for initial-letter stutters such as `o-okay`/`o-kay` and over-exaggerated letter runs while retaining the original token for issue reporting.
- Verified the new cases and dictionary-package formats in all 31 Core tests, plus all 49 UI workflow tests at desktop (1280x1000) and mobile (390x844) widths.