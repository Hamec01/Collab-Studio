import React from "react";
import { Link, useInRouterContext } from "react-router-dom";
import Button from "../../shared/ui/Button";
import OfflineBanner from "./OfflineBanner";
import SpriteIcon, { type SpriteIconName } from "../../shared/ui/SpriteIcon";
import "./app-shell-redesign.css";

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
  const showDesktopNav = Boolean(currentUser);

  const desktopNavItems: Array<{ key: string; label: string; href: string; spriteIcon: SpriteIconName; active: boolean }> = [
    {
      key: "discover",
      label: "Главная",
      href: "/main",
      spriteIcon: "home",
      active: activePath === "/" || activePath === "/main" || activePath.startsWith("/discover"),
    },
    {
      key: "studio",
      label: "Studio",
      href: "/app",
      spriteIcon: "folders",
      active: activePath === "/app" || activePath.startsWith("/app/projects"),
    },
    {
      key: "messages",
      label: "Сообщения",
      href: "/app/messages",
      spriteIcon: "chats",
      active: activePath.startsWith("/app/messages"),
    },
    {
      key: "publications",
      label: "Релизы",
      href: "/app/publications",
      spriteIcon: "musicUpload",
      active: activePath.startsWith("/app/publications"),
    },
    {
      key: "profile",
      label: "Профиль",
      href: "/app/profile",
      spriteIcon: "user",
      active: activePath.startsWith("/app/profile"),
    },
  ];

  const defaultItems: MobileNavItem[] = [
    { key: "discover", label: "Главная", spriteIcon: "home", active: activePath === "/main" || activePath === "/discover" || activePath === "/", href: "/main" },
    { key: "studio", label: "Studio", spriteIcon: "folders", active: activePath.startsWith("/app/projects") || activePath === "/app", href: "/app" },
    { key: "messages", label: "Inbox", spriteIcon: "chats", active: activePath.startsWith("/app/messages"), href: "/app/messages" },
    { key: "profile", label: "Profile", spriteIcon: "user", active: activePath.startsWith("/app/profile"), href: "/app/profile" },
  ];

  const itemsToRender = mobileNavItems && mobileNavItems.length > 0 ? mobileNavItems : defaultItems;
  const userLabel = currentUser?.displayName || currentUser?.username || "Коллаборатор";

  return (
    <div className={`app-shell app-shell-redesign min-h-dvh text-[var(--cs-color-text)]${displayMobileNav ? " has-mobile-nav" : ""}${showDesktopNav ? " has-desktop-nav" : ""}`}>
      <div className="app-shell-redesign__backdrop" aria-hidden="true" />

      <div className={`app-shell-redesign__layout${showDesktopNav ? "" : " app-shell-redesign__layout--single"}`}>
        {showDesktopNav && (
          <aside className="app-shell-redesign__sidebar hidden lg:flex">
            {inRouter ? (
              <Link to="/" className="app-shell-redesign__brand" aria-label="CollabStudio home">
                <span className="app-shell-redesign__brand-mark">CS</span>
                <span className="app-shell-redesign__brand-text">
                  <strong>CollabStudio</strong>
                  <small>Creative workspace</small>
                </span>
              </Link>
            ) : (
              <a href="/" className="app-shell-redesign__brand" aria-label="CollabStudio home">
                <span className="app-shell-redesign__brand-mark">CS</span>
                <span className="app-shell-redesign__brand-text">
                  <strong>CollabStudio</strong>
                  <small>Creative workspace</small>
                </span>
              </a>
            )}

            <nav className="app-shell-redesign__sidebar-nav" aria-label="Основная навигация">
              {desktopNavItems.map((item) => {
                const navClass = `app-shell-redesign__sidebar-link${item.active ? " is-active" : ""}`;
                const content = (
                  <>
                    <SpriteIcon name={item.spriteIcon} size={18} />
                    <span>{item.label}</span>
                  </>
                );

                if (inRouter) {
                  return (
                    <Link key={item.key} to={item.href} className={navClass}>
                      {content}
                    </Link>
                  );
                }

                return (
                  <a key={item.key} href={item.href} className={navClass}>
                    {content}
                  </a>
                );
              })}
            </nav>

            <div className="app-shell-redesign__user-card">
              <span className="app-shell-redesign__user-avatar">{String(userLabel).slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{userLabel}</strong>
                {currentUser?.username && <small>@{currentUser.username}</small>}
              </div>
            </div>
          </aside>
        )}

        <div className="app-shell-redesign__stage">
          <header className="app-shell-header app-shell-redesign__topbar">
            <div className="app-shell-redesign__title-group">
              <span className="app-shell-redesign__eyebrow">Studio</span>
              <h1>{title}</h1>
            </div>
            <div className="app-shell-redesign__topbar-right">
              {inRouter ? <Link to="/main" className="app-shell-redesign__quick-link">Главная</Link> : <a href="/main" className="app-shell-redesign__quick-link">Главная</a>}
              {inRouter ? <Link to="/app" className="app-shell-redesign__quick-link">Проекты</Link> : <a href="/app" className="app-shell-redesign__quick-link">Проекты</a>}
              {headerRight}
            </div>
          </header>

          <OfflineBanner />

          <main className="app-shell-main app-shell-redesign__main flex-1 min-h-0 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>

      {displayMobileNav && (
        <nav className="app-shell-mobile-nav fixed bottom-0 left-0 right-0 z-50 lg:hidden px-4 pb-[var(--cs-safe-bottom)] pt-2 bg-gradient-to-t from-black/95 via-black/90 to-transparent" aria-label="Mobile Navigation">
          <div className="app-shell-redesign__mobile-nav-bar mx-auto max-w-sm rounded-[1.4rem] border border-white/10 bg-neutral-950/88 p-1 shadow-2xl backdrop-blur-xl">
            {itemsToRender.map((item) => {
              const Icon = item.icon;
              const content = (
                <>
                  {item.spriteIcon ? (
                    <SpriteIcon name={item.spriteIcon} size={20} className="app-shell-redesign__mobile-nav-icon" />
                  ) : Icon ? (
                    <Icon className="app-shell-redesign__mobile-nav-icon" />
                  ) : null}
                  <span className="sr-only">{item.label}</span>
                  <span className="app-shell-redesign__mobile-nav-indicator" aria-hidden="true" />
                </>
              );
              const buttonClass = `app-shell-redesign__mobile-nav-item flex-1 flex items-center justify-center rounded-[1rem] px-1 min-h-11 min-w-11 ${
                item.active ? "is-active text-white" : "text-neutral-400"
              }`;

              if (item.href) {
                if (inRouter) {
                  return (
                    <Link key={item.key} to={item.href} className={buttonClass} aria-label={item.label}>
                      {content}
                    </Link>
                  );
                }

                return (
                  <a key={item.key} href={item.href} className={buttonClass} aria-label={item.label}>
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
                  aria-label={item.label}
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
