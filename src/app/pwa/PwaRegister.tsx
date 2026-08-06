import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const LOCAL_SW_RESET_KEY = "cs-local-sw-reset-v1";

async function clearLocalServiceWorkerCache() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;
  if (window.sessionStorage.getItem(LOCAL_SW_RESET_KEY) === "done") return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }
  } finally {
    window.sessionStorage.setItem(LOCAL_SW_RESET_KEY, "done");
  }
}

export default function PwaRegister() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered:", r);
    },
    onRegisterError(error) {
      console.error("SW registration error", error);
    },
  });

  useEffect(() => {
    void clearLocalServiceWorkerCache();
  }, []);

  useEffect(() => {
    if (needRefresh) {
      // Always switch to the latest bundle to avoid stale UI across route redesigns.
      void updateServiceWorker(true);
      setNeedRefresh(false);
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
