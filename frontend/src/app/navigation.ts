export interface NavItem {
  path: string
  label: string
  /** Page title used in the document <title>. */
  title: string
}

/** A dropdown in the main menu. */
export interface NavGroup {
  label: string
  items: readonly NavItem[]
}

export type NavEntry = NavItem | NavGroup

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry
}

export const NAV_MENU: readonly NavEntry[] = [
  { path: '/', label: 'Ana Sayfa', title: 'Ana Sayfa' },
  {
    label: 'Filtre',
    items: [
      { path: '/hacim', label: 'Hacim', title: 'Hacim Patlaması' },
      { path: '/rsi', label: 'RSI', title: 'RSI Tarayıcı' },
      { path: '/ema', label: 'EMA', title: 'EMA Tarayıcı' },
      { path: '/birlesik-filtre', label: 'Birleşik Filtre', title: 'Birleşik Filtre' },
    ],
  },
  { path: '/fiyat-hacim', label: 'Fiyat/Hacim', title: 'Fiyat/Hacim' },
  { path: '/golden-cross', label: 'Golden Cross', title: 'Golden / Death Cross' },
  { path: '/uyumsuzluk', label: 'Uyumsuzluk', title: 'RSI Uyumsuzluğu' },
  { path: '/open-interest', label: 'Open Interest', title: 'Open Interest' },
  { path: '/funding', label: 'Funding', title: 'Funding Oranları' },
]

/** The Binance Alpha (Web3) section, a separate site under /web3. */
export const ALPHA_HOME = '/web3'

export const ALPHA_NAV_MENU: readonly NavEntry[] = [
  { path: '/web3/hacim', label: 'Hacim', title: 'Hacim Patlaması' },
  { path: '/web3/rsi', label: 'RSI', title: 'RSI Tarayıcı' },
  { path: '/web3/fiyat-hacim', label: 'Fiyat/Hacim', title: 'Fiyat/Hacim' },
]

const flatten = (menu: readonly NavEntry[]): readonly NavItem[] =>
  menu.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]))

/** Every page in the menu, dropdowns flattened. */
export const NAV_ITEMS: readonly NavItem[] = flatten(NAV_MENU)
export const ALPHA_NAV_ITEMS: readonly NavItem[] = flatten(ALPHA_NAV_MENU)
