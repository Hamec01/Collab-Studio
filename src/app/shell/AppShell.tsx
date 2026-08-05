import React from "react";
import { Link, useInRouterContext } from "react-router-dom";
import Button from "../../shared/ui/Button";
import OfflineBanner from "./OfflineBanner";
import SpriteIcon, { type SpriteIconName } from "../../shared/ui/SpriteIcon";

type MobileNavItem = {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  spriteIcon?: SpriteIconName;
  active: boolean;
  onPress?: () => void;
  href?: string;
};

type AppShellProps = {
  title: string;
  headerRight?: React.ReactNode;
  showMobileNav?: boolean;
  mobileNavItems?: MobileNavItem[];
  currentUser?: any;
  children: React.ReactNode;
};

export default function AppShell({
  title,
  headerRight,
  showMobileNav,
  mobileNavItems,
  currentUser,
  children,
}: AppShellProps) {
  const inRouter = useInRouterContext();
  const activePath = typeof window !== "undefined" ? window.location.pathname : "";
  const displayMobileNav = showMobileNav ?? Boolean(currentUser);

  const defaultItems: MobileNavItem[] = [
    { key: "discover", label: "Главная", spriteIcon: "home", active: activePath === "/main" || activePath === "/discover" || activePath === "/", href: "/main" },
    { key: "studio", label: "Studio", spriteIcon: "folders", active: activePath.startsWith("/app/projects") || activePath === "/app", href: "/app" },
    { key: "publications", label: "Releases", spriteIcon: "wave", active: activePath.startsWith("/app/publications"), href: "/app/publications" },
    { key: "profile", label: "Profile", spriteIcon: "user", active: activePath.startsWith("/app/profile"), href: "/app/profile" },
  ];

  const itemsToRender = mobileNavItems && mobileNavItems.length > 0 ? mobileNavItems : defaultItems;

  return (
    <div className="app-shell min-h-dvh flex flex-col bg-[var(--cs-color-bg)] text-[var(--cs-color-text)]">
      <header className="app-shell-header border-b px-4 py-2 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md bg-[var(--cs-color-bg-elevated)]/90 border-[var(--cs-color-border)]">
        <div className="flex items-center gap-6">
          {inRouter ? (
            <Link to="/" className="flex items-center select-none cursor-pointer">
              <img
                src="/logo.png"
                alt="CollabStudio"
                className="h-14 sm:h-20 w-auto object-contain"
                style={{ filter: "drop-shadow(0 0 10px rgba(255,255,255,0.85)) drop-shadow(0 0 28px rgba(129,140,248,0.55)) brightness(1.38) contrast(1.08)" }}
              />
            </Link>
          ) : (
            <a href="/" className="flex items-center select-none cursor-pointer">
              <img
                src="/logo.png"
                alt="CollabStudio"
                className="h-14 sm:h-20 w-auto object-contain"
                style={{ filter: "drop-shadow(0 0 10px rgba(255,255,255,0.85)) drop-shadow(0 0 28px rgba(129,140,248,0.55)) brightness(1.38) contrast(1.08)" }}
              />
            </a>
          )}
          {inRouter ? (
            <Link to="/main" className="hidden sm:inline text-sm font-semibold text-neutral-400 hover:text-white transition-colors">
              Главная
            </Link>
          ) : (
            <a href="/main" className="hidden sm:inline text-sm font-semibold text-neutral-400 hover:text-white transition-colors">
              Главная
            </a>
          )}
          {inRouter ? (
            <Link to="/app" className="hidden sm:inline text-sm font-semibold text-neutral-400 hover:text-white transition-colors">
              Studio
            </Link>
          ) : (
            <a href="/app" className="hidden sm:inline text-sm font-semibold text-neutral-400 hover:text-white transition-colors">
              Studio
            </a>
          )}
        </div>
        {headerRight}
      </header>

      <OfflineBanner />

      <main className="app-shell-main flex-1 min-h-0 overflow-y-auto">
        {children}
      </main>

      {displayMobileNav && (
        <nav className="app-shell-mobile-nav fixed bottom-0 left-0 right-0 z-50 lg:hidden px-4 pb-[var(--cs-safe-bottom)] pt-2 bg-gradient-to-t from-black/95 via-black/90 to-transparent" aria-label="Mobile Navigation">
          <div className="mx-auto max-w-md rounded-2xl flex items-center justify-around p-1.5 shadow-2xl border backdrop-blur-lg bg-neutral-900/90 border-neutral-800">
            {itemsToRender.map((item) => {
              const Icon = item.icon;
              const content = (
                <>
                  {item.spriteIcon ? (
                    <SpriteIcon name={item.spriteIcon} size={20} className="mb-1" />
                  ) : Icon ? (
                    <Icon className="w-5 h-5 mb-1" />
                  ) : null}
                  <span className="text-[10px] font-bold">{item.label}</span>
                </>
              );
              const buttonClass = `flex-1 flex flex-col items-center justify-center rounded-xl py-2 px-1 min-h-11 min-w-11 ${
                item.active ? "text-white bg-indigo-600/30 border-indigo-500/40" : "text-neutral-300"
              }`;

              if (item.href) {
                if (inRouter) {
                  return (
                    <Link key={item.key} to={item.href} className={buttonClass}>
                      {content}
                    </Link>
                  );
                }

                return (
                  <a key={item.key} href={item.href} className={buttonClass}>
                    {content}
                  </a>
                );
              }

              return (
                <Button
                  key={item.key}
                  variant="ghost"
                  onClick={item.onPress}
                  className={buttonClass}
                  aria-current={item.active ? "page" : undefined}
                >
                  {content}
                </Button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
