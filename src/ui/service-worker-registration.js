const status = document.querySelector("#offline-support-status");

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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(async (registration) => {
      const readyRegistration = await navigator.serviceWorker.ready;
      const worker = registration.active ?? readyRegistration.active;
      if (!worker) throw new Error("The offline service worker has no active worker.");
      await waitForActivation(worker);
      status.textContent = "Offline support is ready. This app can open without an internet connection.";
      status.classList.add("is-ready");
    })
    .catch((error) => {
      status.textContent = `Offline support could not be enabled: ${error.message}`;
      status.classList.add("is-error");
      console.error("Offline support could not be registered.", error);
    });
} else {
  status.textContent = "Offline support is unavailable in this browser or origin.";
  status.classList.add("is-error");
  console.error("Offline support is unavailable in this browser or origin.");
}
