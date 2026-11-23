const NOTIFICATION_TYPES = new Set(["success", "error", "warning", "confirmation"]);
const AUTO_DISMISS_MS = 5000;
const MAX_NOTIFICATION_COUNT = 5;

export function setupNotifications(root) {
  const container = root.querySelector("#notification-toasts");
  if (!container) throw new Error("The application must contain a notification toast container.");
  const document = container.ownerDocument;
  const window = document.defaultView;

  const handleAppNotification = (event) => {
    const { type, message } = event.detail ?? {};
    show(type, message);
  };
  window.addEventListener("app-notification", handleAppNotification);

  function show(type, message, duration = AUTO_DISMISS_MS) {
    if (!NOTIFICATION_TYPES.has(type)) {
      throw new TypeError(`Unsupported notification type "${type}".`);
    }
    if (!String(message).trim()) throw new TypeError("Notification messages must not be empty.");

    const toast = document.createElement("section");
    toast.className = "notification-toast";
    toast.dataset.type = type;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.setAttribute("aria-label", `${type[0].toLocaleUpperCase()}${type.slice(1)} notification`);
    const text = document.createElement("p");
    text.textContent = String(message);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "notification-toast-dismiss";
    dismiss.textContent = "Dismiss";
    dismiss.setAttribute("aria-label", `Dismiss ${type} notification`);
    dismiss.addEventListener("click", () => removeToast(toast));
    toast.append(text, dismiss);
    container.append(toast);
    while (container.children.length > MAX_NOTIFICATION_COUNT) {
      removeToast(container.firstElementChild);
    }

    if (type !== "error" && type !== "confirmation") {
      const timer = window.setTimeout(() => removeToast(toast), duration);
      toast.addEventListener("notification-dismiss", () => window.clearTimeout(timer), { once: true });
    }
    return toast;
  }

  function removeToast(toast) {
    toast.dispatchEvent(new window.Event("notification-dismiss"));
    toast.remove();
  }

  return Object.freeze({
    show,
    dispose() {
      window.removeEventListener("app-notification", handleAppNotification);
    },
    success(message) {
      return show("success", message);
    },
    error(message) {
      return show("error", message);
    },
    warning(message) {
      return show("warning", message);
    },
    confirmation(message) {
      return show("confirmation", message);
    },
  });
}
