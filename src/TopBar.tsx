import { useEffect, useRef, type MouseEventHandler, type ReactNode } from "react";
import { playPageHrefs, type Page } from "./shareSearch";

const pages = [
  { id: "1d", href: playPageHrefs["1d"], label: "Play 2D" },
  { id: "2d", href: playPageHrefs["2d"], label: "Play 3D" },
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
    const wide = window.matchMedia("(min-width: 481px)");
    const close = () => menuRef.current?.hidePopover();
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);
  const currentPage = pages.find((item) => item.id === page)!;
  const links = pages.map((item) => <a key={item.id} href={item.href} aria-current={page === item.id ? "page" : undefined} onClick={(event) => {
    menuRef.current?.hidePopover();
    if (item.id === "1d") onPlay2D(event);
  }}>{item.label}<span className="page-check" aria-hidden="true">{page === item.id ? "✓" : ""}</span></a>);
  return <header className="app-header">
    <h1 className="app-brand"><a href={playPageHrefs["1d"]} onClick={onPlay2D} aria-label="TPE Playground"><img src={`${import.meta.env.BASE_URL}favicon.svg`} width="28" height="28" alt="" /><span>TPE Playground</span></a></h1>
    <nav className="app-tabs" aria-label="Pages">{links}</nav>
    <button className="page-picker" popoverTarget="page-picker-menu" aria-label={`Pages: ${currentPage.label}`}><span>{currentPage.label}</span><span aria-hidden="true">⌄</span></button>
    <div id="page-picker-menu" className="page-picker-menu" popover="auto" ref={menuRef}><nav aria-label="Pages">{links}</nav></div>
    <div className="app-actions">{actionSlot}<button className="theme-toggle" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={onThemeChange}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />}</svg></button></div>
  </header>;
}
