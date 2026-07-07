import React, { useState, useEffect } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const { t } = useI18n();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      data-testid="offline-banner"
      className="bg-amber-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-semibold select-none"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>{t("shell.offline")}</span>
    </div>
  );
}
