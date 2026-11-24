const status = document.querySelector("#offline-installation-status");
const offlineTab = document.querySelector("#about-tab-offline");
const displayMode = window.matchMedia("(display-mode: standalone)");
let offlineReady = false;
let offlineFailed = false;
let installPromptAvailable = false;
let installedEventObserved = false;

function notify(type, message) {
  window.dispatchEvent(new CustomEvent("app-notification", { detail: { type, message } }));
}

function waitForActivation(worker) {
  if (worker.state === "activated") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onStateChange);
        resolve();
      } else if (worker.state === "redundant") {
        worker.removeEventListener("statechange", onStateChange);
        reject(new Error("The offline service worker did not activate."));
      }
    };
    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

function isInstalled() {
  return displayMode.matches || navigator.standalone === true || installedEventObserved;
}

function updateStatus() {
  let message;
  let statusClass;
  if (isInstalled()) {
    message = offlineReady
      ? "LOCALMAN is installed and ready to open offline."
      : offlineFailed
        ? "LOCALMAN is installed, but offline support could not be enabled."
        : "LOCALMAN is installed; offline support is still being checked.";
    statusClass = offlineReady ? "is-ready" : "is-warning";
  } else if (!window.isSecureContext || !("serviceWorker" in navigator)) {
    message = "Offline app installation is not supported from this browser or origin.";
    statusClass = "is-error";
  } else if (offlineFailed) {
    message = "Offline support is not ready. Open LOCALMAN from localhost or HTTPS and try again.";
    statusClass = "is-warning";
  } else if (!offlineReady) {
    message = "Offline support is not ready yet. Keep this page open while the app is prepared.";
    statusClass = "is-warning";
  } else if (installPromptAvailable) {
    message = "Offline support is ready, and this browser reports that LOCALMAN can be installed.";
    statusClass = "is-ready";
  } else {
    message = "Offline support is ready. This browser has not confirmed installation availability; follow the platform instructions below.";
    statusClass = "is-ready";
  }
  status.title = message;
  status.setAttribute("aria-label", message);
  status.classList.remove("is-ready", "is-warning", "is-error");
  status.classList.add(statusClass);
  status.dataset.status = statusClass === "is-ready"
    ? "available"
    : statusClass === "is-error" ? "unavailable" : "partial";
  offlineTab.title = message;
}

window.addEventListener("beforeinstallprompt", () => {
  installPromptAvailable = true;
  updateStatus();
});
window.addEventListener("appinstalled", () => {
  installedEventObserved = true;
  updateStatus();
});
if (displayMode.addEventListener) displayMode.addEventListener("change", updateStatus);
else displayMode.addListener(updateStatus);
updateStatus();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(async (registration) => {
      const readyRegistration = await navigator.serviceWorker.ready;
      const worker = registration.active ?? readyRegistration.active;
      if (!worker) throw new Error("The offline service worker has no active worker.");
      await waitForActivation(worker);
      offlineReady = true;
      updateStatus();
    })
    .catch((error) => {
      const message = `Offline support could not be enabled: ${error.message}`;
      offlineFailed = true;
      updateStatus();
      notify("error", message);
      console.error("Offline support could not be registered.", error);
    });
} else {
  const message = "Offline support is unavailable in this browser or origin.";
  offlineFailed = true;
  updateStatus();
  notify("warning", message);
  console.error("Offline support is unavailable in this browser or origin.");
}
