import { useEffect, useRef, type MouseEventHandler, type ReactNode } from "react";
import { playPageHrefs, type Page } from "./shareSearch";

const pages = [
  { id: "play-2d", href: playPageHrefs["play-2d"], label: "Play 2D" },
  { id: "play-3d", href: playPageHrefs["play-3d"], label: "Play 3D" },
  { id: "lab", href: "#lab", label: "Lab" },
  { id: "about", href: "#about", label: "About" },
] as const;

export function TopBar({ page, dark, onPlay2D, onThemeChange, actionSlot }: {
  page: Page;
  dark: boolean;
  onPlay2D: MouseEventHandler<HTMLAnchorElement>;
  onThemeChange: () => void;
  actionSlot: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wide = window.matchMedia(page === "lab" ? "(width > 540px)" : "(width > 480px)");
    const close = () => menuRef.current?.hidePopover();
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, [page]);
  const currentPage = pages.find((item) => item.id === page)!;
  const links = pages.map((item) => <a key={item.id} href={item.href} aria-current={page === item.id ? "page" : undefined} onClick={(event) => {
    menuRef.current?.hidePopover();
    if (item.id === "play-2d") onPlay2D(event);
  }}>{item.label}<span className="page-check" aria-hidden="true">{page === item.id ? "✓" : ""}</span></a>);
  const sourceLink = <a className="source-link" href="https://github.com/Kaichi-Irie/tpe-playground" target="_blank" rel="noopener" aria-label="View source code on GitHub (opens in a new tab)" title="View source code on GitHub (opens in a new tab)" onClick={() => menuRef.current?.hidePopover()}>
    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>
    <span className="source-link-label">Source<span className="source-link-full"> code</span></span>
  </a>;
  return <header className="app-header">
    <h1 className="app-brand"><a href={playPageHrefs["play-2d"]} onClick={onPlay2D} aria-label="TPE Playground"><img src={`${import.meta.env.BASE_URL}favicon.svg`} width="28" height="28" alt="" /><span>TPE Playground</span></a></h1>
    <nav className="app-tabs" aria-label="Pages">{links}</nav>
    <button className="page-picker" popoverTarget="page-picker-menu" aria-label={`Pages: ${currentPage.label}`}><span>{currentPage.label}</span><span aria-hidden="true">⌄</span></button>
    <div id="page-picker-menu" className="page-picker-menu" popover="auto" ref={menuRef}><nav aria-label="Pages">{links}</nav>{page === "lab" && sourceLink}</div>
    <div className="app-actions">{actionSlot}<button className="theme-toggle" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={onThemeChange}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />}</svg></button>{sourceLink}</div>
  </header>;
}
