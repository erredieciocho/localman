const CACHE_NAME = "localman-shell-v3";
const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./version.json",
  "./credits.md",
  "./docs/changelog.md",
  "./src/plugins/manifest.json",
  "./service-worker.js",
  "./assets/localman.svg",
  "./assets/localman.png",
  "./assets/data/maps.json",
  "./styles/app.css",
  "./styles/components/modal.css",
  "./styles/components/statistics-grid.css",
  "./styles/components/table.css",
  "./styles/components/treemap.css",
  "./src/application/index.js",
  "./src/application/localisation-service.js",
  "./src/core/document/comparison.js",
  "./src/core/document/index.js",
  "./src/core/document/localisation.js",
  "./src/core/glossary/index.js",
  "./src/core/glossary/terminology.js",
  "./src/core/parser/index.js",
  "./src/core/spellcheck/index.js",
  "./src/core/spellcheck/spellcheck.js",
  "./src/core/statistics/index.js",
  "./src/core/statistics/statistics.js",
  "./src/core/statistics/word-usage.js",
  "./src/core/text/index.js",
  "./src/core/text/visible-text.js",
  "./src/core/translation/autocomplete.js",
  "./src/core/translation/index.js",
  "./src/core/validation/index.js",
  "./src/core/validation/validation.js",
  "./src/platform/browser/dictionary.js",
  "./src/platform/browser/file-handle-store.js",
  "./src/platform/browser/file-system.js",
  "./src/platform/browser/storage.js",
  "./src/plugins/TCOAAL/index.js",
  "./src/plugins/TCOAAL/formats/csv/csv-document.js",
  "./src/plugins/TCOAAL/formats/csv/csv-format.js",
  "./src/plugins/TCOAAL/formats/csv/csv-parser.js",
  "./src/plugins/TCOAAL/formats/csv/index.js",
  "./src/plugins/TCOAAL/formats/cld/cld-format.js",
  "./src/plugins/TCOAAL/formats/cld/index.js",
  "./src/plugins/TCOAAL/formats/txt/txt-format.js",
  "./src/plugins/TCOAAL/formats/txt/index.js",
  "./src/ui/app.js",
  "./src/ui/components/modal.js",
  "./src/ui/components/notifications.js",
  "./src/ui/components/statistics-grid.js",
  "./src/ui/components/table-cells.js",
  "./src/ui/components/table.js",
  "./src/ui/components/treemap.js",
  "./src/ui/containers/compare.js",
  "./src/ui/containers/dashboard.js",
  "./src/ui/containers/editor.js",
  "./src/ui/containers/maps.js",
  "./src/ui/containers/qa.js",
  "./src/ui/containers/settings.js",
  "./src/ui/containers/terminology.js",
  "./src/ui/containers/about.js",
  "./src/ui/service-worker-registration.js",
  "./src/ui/utils/configuration.js",
  "./src/ui/utils/dictionary.js",
  "./src/ui/utils/entry-table.js",
  "./src/ui/utils/file-controls.js",
  "./src/ui/utils/occurrences.js",
  "./src/ui/utils/section-list.js",
  "./src/ui/utils/source-colors.js",
  "./src/vendor/jszip/jszip.min.js",
  "./src/vendor/typo-js/typo.js",
  "./bundled/dictionaries/manifest.json",
  "./bundled/dictionaries/ca/index.aff",
  "./bundled/dictionaries/ca/index.dic",
  "./bundled/dictionaries/fr/index.aff",
  "./bundled/dictionaries/fr/index.dic",
  "./bundled/dictionaries/fr/license",
  "./bundled/dictionaries/de/index.aff",
  "./bundled/dictionaries/de/index.dic",
  "./bundled/dictionaries/de/license",
  "./bundled/dictionaries/pt/index.aff",
  "./bundled/dictionaries/pt/index.dic",
  "./bundled/dictionaries/pt/license",
  "./bundled/dictionaries/pl/index.aff",
  "./bundled/dictionaries/pl/index.dic",
  "./bundled/dictionaries/pl/license",
  "./bundled/dictionaries/ru/index.aff",
  "./bundled/dictionaries/ru/index.dic",
  "./bundled/dictionaries/ru/license",
  "./bundled/dictionaries/ko/index.aff",
  "./bundled/dictionaries/ko/index.dic",
  "./bundled/dictionaries/ko/license",
  "./bundled/dictionaries/es/index.aff",
  "./bundled/dictionaries/es/index.dic",
  "./bundled/dictionaries/es-MX/index.aff",
  "./bundled/dictionaries/es-MX/index.dic",
  "./bundled/dictionaries/es-MX/ATTRIBUTION.txt",
  "./bundled/dictionaries/es-MX/LICENSE-MPL-1.1.txt",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const requests = APP_SHELL_URLS.map((url) =>
      new Request(new URL(url, self.registration.scope), { cache: "reload" }));
    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("localman-shell-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.error("Offline cache could not be updated for", requestUrl.href, error);
        }
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === "navigate") {
        const appShell = await cache.match(new URL("./index.html", self.registration.scope));
        if (appShell) return appShell;
      }
      throw error;
    }
  })());
});
