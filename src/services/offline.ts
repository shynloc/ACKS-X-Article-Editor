export interface OfflineState {
  ready: boolean;
  online: boolean;
  update?: () => void;
}
export function registerOffline(notify: (state: OfflineState) => void) {
  const state: OfflineState = { ready: false, online: navigator.onLine };
  let active = true;
  const emit = () => {
      if (active) notify({ ...state });
    },
    online = () => {
      state.online = navigator.onLine;
      emit();
    };
  window.addEventListener("online", online);
  window.addEventListener("offline", online);
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        navigator.serviceWorker.ready.then(() => {
          state.ready = true;
          emit();
        });
        const update = () => {
          if (registration.waiting) {
            state.update = () => {
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => location.reload(),
                { once: true },
              );
              registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            };
            emit();
          }
        };
        update();
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", update);
        });
      })
      .catch(() => {
        state.ready = false;
        emit();
      });
  }
  return () => {
    active = false;
    window.removeEventListener("online", online);
    window.removeEventListener("offline", online);
  };
}
