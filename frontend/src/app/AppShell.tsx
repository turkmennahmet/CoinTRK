import { Suspense, useEffect, useId, useRef, useState } from 'react'
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'

import { Skeleton } from '../components/ui/QueryState'
import { useTheme, type ThemePreference } from '../hooks/useTheme'
import { NAV_ITEMS, NAV_MENU, isNavGroup, type NavGroup, type NavItem } from './navigation'
import styles from './AppShell.module.css'

const THEME_LABEL: Record<ThemePreference, string> = {
  system: 'Tema: sistem',
  dark: 'Tema: koyu',
  light: 'Tema: açık',
}

export function AppShell() {
  const [theme, cycleTheme] = useTheme()
  const { pathname } = useLocation()

  useEffect(() => {
    const item = NAV_ITEMS.find((i) => i.path === pathname)
    const coin = /^\/coin\/([^/]+)/.exec(pathname)?.[1]
    const title = item?.title ?? (coin ? decodeURIComponent(coin).toUpperCase() : null)
    document.title = title ? `${title} · CoinTRK` : 'CoinTRK'
  }, [pathname])

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        İçeriğe geç
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink to="/" className={styles.brand} aria-label="CoinTRK ana sayfa">
            <Logo />
            <span>
              Tur<strong>Coin</strong>
            </span>
          </NavLink>
          <nav className={styles.nav} aria-label="Ana menü">
            {NAV_MENU.map((entry) =>
              isNavGroup(entry) ? (
                <NavDropdown key={entry.label} group={entry} />
              ) : (
                <MenuLink key={entry.path} item={entry} className={styles.navLink} activeClassName={styles.navActive} />
              ),
            )}
          </nav>
          <button
            type="button"
            className={styles.themeButton}
            onClick={cycleTheme}
            aria-label={THEME_LABEL[theme]}
            title={THEME_LABEL[theme]}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </header>

      <main id="main" className={styles.main}>
        <Suspense fallback={<Skeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className={styles.footer}>
        Veriler Binance USDⓈ-M Futures herkese açık API'sinden alınır. Yatırım tavsiyesi değildir.
      </footer>
      <ScrollRestoration />
    </div>
  )
}

function MenuLink({
  item,
  className,
  activeClassName,
  onClick,
}: {
  item: NavItem
  className: string
  activeClassName: string
  onClick?: () => void
}) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onClick}
      className={({ isActive }) => `${className} ${isActive ? activeClassName : ''}`}
    >
      {item.label}
    </NavLink>
  )
}

/**
 * Menu entry that opens a list of pages. The list is positioned with `fixed`
 * so the horizontally scrolling menu bar does not clip it.
 */
function NavDropdown({ group }: { group: NavGroup }) {
  const { pathname } = useLocation()
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const open = position !== null
  const active = group.items.some((item) => item.path === pathname)

  useEffect(() => {
    if (!open) return
    const close = () => setPosition(null)
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    // Capture phase also catches the menu bar's own horizontal scroll.
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  function toggle() {
    const button = buttonRef.current
    if (open || !button) {
      setPosition(null)
      return
    }
    // The header's backdrop-filter makes it the containing block of fixed children.
    const origin = button.closest('header')?.getBoundingClientRect() ?? { top: 0, left: 0 }
    const rect = button.getBoundingClientRect()
    setPosition({ top: rect.bottom - origin.top + 6, left: rect.left - origin.left })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.navLink} ${styles.navButton} ${active ? styles.navActive : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
      >
        {group.label}
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className={styles.chevron} data-open={open}>
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
      <div ref={listRef} id={listId} className={styles.dropdown} hidden={!open} style={position ?? undefined}>
        {group.items.map((item) => (
          <MenuLink
            key={item.path}
            item={item}
            className={styles.dropdownLink}
            activeClassName={styles.dropdownActive}
            onClick={() => setPosition(null)}
          />
        ))}
      </div>
    </>
  )
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M8 21.5 13 15l4 3.5L24 10"
        fill="none"
        stroke="var(--accent-text)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="10" r="2.2" fill="var(--accent-text)" />
    </svg>
  )
}

function ThemeIcon({ theme }: { theme: ThemePreference }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }
  if (theme === 'dark') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }
  if (theme === 'light') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  return (
    <svg {...common} aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}
