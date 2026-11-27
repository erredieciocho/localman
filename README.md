# LOCALMAN

A dedicated localisation manager for The Coffin of Andy and Leyley.

## About

LOCALMAN is a browser-based application designed to simplify the localisation workflow for **The Coffin of Andy and Leyley**.

It brings editing, translation analysis, terminology management and quality assurance together in one place. 

Files are handled locally in the browser, and the application can be installed as a Progressive Web App (PWA) for offline use.

## Features

### Localisation Editor
- Browse and edit localisation entries by section.
- Open CSV, CLD and TXT localisation files; CLD files are read-only, while CSV and TXT files can be edited, saved and exported. TXT support currently covers TCOAAL 3.x.
- TXT files contain target-language text without English source strings, so English-based progress and source-word statistics are unavailable.
- For read-only CLD files, Dashboard retains file metadata; Compare, QA, Terminology and Maps are unavailable.
- Search, filter and sort entries.
- Find and replace text in editable fields.
- Import and export individual CSV and TXT sections.
- Save changes to an opened editable file where supported, or export a separate copy.
- Receive suggestions from exact and similar translations already present in the file.

### Dashboard and Statistics
- Track overall and section-level translation progress.
- Explore map statistics, including entry counts, unique words and complexity.
- Analyse Source-tag distributions and occurrences.
- Inspect target-language word usage, with spelling-status and other filters.

### Terminology Management
- Browse terms and definitions extracted from localisation metadata.
- Inspect translations and translated descriptions.
- Track terminology occurrences across maps and navigate to matching entries.

### Quality Assurance
- Review spelling, sentence-length and terminology issues.
- Filter and search issues, grouped by section.
- Mark individual issues or entire sections as resolved or unresolved.
- Import and export QA review data.

### Maps Catalogue
- Browse and search maps, episodes, routes and endings.
- Filter catalogue entries by episode and route.
- Inspect map descriptions and summaries.
- Navigate between catalogue entries and matching localisation content.

### File Comparison
- Compare the currently open localisation file with another editable CSV or TXT file.
- Identify changed fields, additional entries and missing entries.
- Match sections by name and entries by ID.

### About
- View the application release, supported game versions and formats, and credits.

### Settings and Customisation
- Configure the target language, validation options and dictionary settings; available regional dictionary variants include Spanish (Spain) and Spanish (Mexico).
- Import and export application configuration.

## Getting Started

### Requirements

- A modern web browser. ;)


### Launch

Python is used only to serve the application locally; the application itself runs in the browser.

1. Download or clone the repository.
2. Open a terminal in the project directory.
3. Start the local server:

   ```bash
   python launch.py
   ```

4. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

To choose an available port automatically:

```bash
python launch.py --port 0
```

To start the server without opening a browser automatically:

```bash
python launch.py --no-browser
```

## Offline Usage

LOCALMAN can be installed as a Progressive Web App (PWA) from a supported browser.

1. Open the application in your browser.
2. Use the browser's install option to install LOCALMAN.
3. Allow the application resources to finish caching before going offline.