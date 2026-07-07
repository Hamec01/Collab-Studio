import React from "react";
import { type LucideIcon } from "lucide-react";
import Button from "../../shared/ui/Button";
import OfflineBanner from "./OfflineBanner";

type MobileNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onPress: () => void;
};

type AppShellProps = {
  title: string;
  headerRight?: React.ReactNode;
  showMobileNav: boolean;
  mobileNavItems: MobileNavItem[];
  children: React.ReactNode;
};

export default function AppShell({ title, headerRight, showMobileNav, mobileNavItems, children }: AppShellProps) {
  return (
    <div className="app-shell min-h-dvh flex flex-col bg-[var(--cs-color-bg)] text-[var(--cs-color-text)]">
      <header className="app-shell-header border-b px-4 py-3 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md bg-[var(--cs-color-bg-elevated)]/90 border-[var(--cs-color-border)]">
        <div className="flex items-center gap-3 select-none">
          <img
            src="/logo.png"
            alt="CollabStudio"
            className="h-12 w-auto object-contain"
            style={{ filter: "drop-shadow(0 0 8px rgba(255,255,255,0.7)) drop-shadow(0 0 20px rgba(220,200,255,0.4)) brightness(1.25)" }}
          />
          <span
            className="hidden sm:block text-sm font-semibold tracking-widest uppercase"
            style={{ color: "rgba(255,255,255,0.9)", letterSpacing: "0.18em", fontFamily: "system-ui, sans-serif" }}
          >
            CollabStudio
          </span>
        </div>
        {headerRight}
      </header>

      <OfflineBanner />

      <main className="app-shell-main flex-1 min-h-0 overflow-y-auto">
        {children}
      </main>

      {showMobileNav && (
        <nav className="app-shell-mobile-nav fixed bottom-0 left-0 right-0 z-50 lg:hidden px-4 pb-[var(--cs-safe-bottom)] pt-2 bg-gradient-to-t from-black/95 via-black/90 to-transparent" aria-label="Mobile Navigation">
          <div className="mx-auto max-w-md rounded-2xl flex items-center justify-around p-1.5 shadow-2xl border backdrop-blur-lg bg-neutral-900/90 border-neutral-800">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.key}
                  variant="ghost"
                  onClick={item.onPress}
                  className={`flex-1 flex-col rounded-xl py-2 px-1 min-h-11 ${item.active ? "text-white bg-indigo-600/30 border-indigo-500/40" : "text-neutral-300"}`}
                  aria-current={item.active ? "page" : undefined}
                >
                  <Icon className="w-5 h-5 mb-1" />
                  <span className="text-[10px] font-bold">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
