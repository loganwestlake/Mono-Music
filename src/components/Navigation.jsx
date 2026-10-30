import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3,
  Command,
  Download,
  Heart,
  History,
  Home,
  Library,
  LogIn,
  Menu,
  MonitorSpeaker,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { href, navigate } from '../lib/router'
import { useLibrary } from '../store/library'
import { useCloud } from '../store/cloud'
import { useUi } from '../store/ui'
import Artwork from './Artwork'

const LINKS = [
  { to: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  { to: '/search', label: 'Search', icon: Search, match: (p) => p.startsWith('/search') },
  {
    to: '/library',
    label: 'Library',
    icon: Library,
    match: (p) => p.startsWith('/library') || p.startsWith('/playlist') || p === '/liked' || p === '/recent',
  },
  { to: '/stats', label: 'Your Stats', icon: BarChart3, match: (p) => p === '/stats' },
]

/** Sidebar contents — shared by the desktop rail and the mobile drawer. */
function NavContents({ path, onNavigate }) {
  const { playlists, liked, recent, createPlaylist } = useLibrary()
  const { setImportOpen, setPaletteOpen, setDevicesOpen } = useUi()
  const cloud = useCloud()

  const newPlaylist = () => {
    const id = createPlaylist(`Playlist ${playlists.length + 1}`)
    navigate(`/playlist/${id}`)
    onNavigate?.()
  }

  return (
    <>
      <a href={href('/')} onClick={onNavigate} className="px-3 text-[22px] font-black tracking-tight uppercase">
        Mono<span className="font-serif text-[26px] font-normal normal-case italic text-neutral-400">music</span>
      </a>

      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          setPaletteOpen(true)
        }}
        className="mx-1 mt-6 flex h-10 items-center gap-2 rounded-full border border-black/10 px-4 text-[12px] text-neutral-400 transition hover:border-black/30"
      >
        <Search size={14} strokeWidth={1.5} />
        <span className="flex-1 text-left">Quick search</span>
        <kbd className="flex items-center gap-0.5 font-sans text-[10px] font-semibold">
          <Command size={10} />K
        </kbd>
      </button>

      <ul className="mt-6 space-y-0.5">
        {LINKS.map(({ to, label, icon: Icon, match }) => (
          <li key={to}>
            <NavLink to={to} active={match(path)} icon={Icon} onClick={onNavigate}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-center justify-between px-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Your playlists</p>
        <div className="flex">
          <button
            type="button"
            onClick={() => {
              onNavigate?.()
              setImportOpen(true)
            }}
            title="Import playlists"
            aria-label="Import playlists"
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-black/5"
          >
            <Download size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={newPlaylist}
            title="New playlist"
            aria-label="New playlist"
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-black/5"
          >
            <Plus size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <ul className="no-scrollbar mt-2 -mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-4">
        <PlaylistLink to="/liked" active={path === '/liked'} name="Liked Songs" count={liked.length} icon={Heart} onClick={onNavigate} />
        <PlaylistLink to="/recent" active={path === '/recent'} name="Recently Played" count={recent.length} icon={History} onClick={onNavigate} />
        {playlists.map((p) => (
          <PlaylistLink
            key={p.id}
            to={`/playlist/${p.id}`}
            active={path === `/playlist/${p.id}`}
            name={p.name}
            count={p.tracks.length}
            tracks={p.tracks}
            onClick={onNavigate}
          />
        ))}
        {playlists.length === 0 && (
          <li className="px-3 py-3 text-[12px] leading-relaxed text-neutral-400">
            No playlists yet.{' '}
            <button type="button" onClick={() => setImportOpen(true)} className="font-semibold text-[#111] underline">
              Import from Spotify
            </button>
          </li>
        )}
      </ul>

      <div className="space-y-0.5 border-t border-black/10 pt-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.()
            setDevicesOpen(true)
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-[#111]/70 transition-colors hover:bg-black/5 hover:text-[#111]"
        >
          <MonitorSpeaker size={15} strokeWidth={1.5} className="shrink-0" />
          <span className="flex-1 text-left">Devices</span>
          {cloud?.devices.some((d) => !d.me && d.online) && <span className="h-1.5 w-1.5 rounded-full bg-[#111]" />}
        </button>
        <NavLink to="/settings" active={path === '/settings'} icon={Settings} small onClick={onNavigate}>
          Settings
        </NavLink>
        <AccountRow onNavigate={onNavigate} />
      </div>
    </>
  )
}

function AccountRow({ onNavigate }) {
  const cloud = useCloud()
  if (!cloud || cloud.user === undefined) return null
  if (!cloud.user)
    return (
      <button
        type="button"
        onClick={cloud.signIn}
        className="mt-1 flex w-full items-center gap-3 rounded-xl bg-[#111] px-3 py-2.5 text-[12px] font-semibold text-white"
      >
        <LogIn size={15} strokeWidth={1.5} />
        Sign in to sync
      </button>
    )
  return (
    <a
      href={href('/settings')}
      onClick={onNavigate}
      className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-black/5"
    >
      {cloud.user.photoURL ? (
        <img src={cloud.user.photoURL} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full grayscale" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#111] text-[11px] font-bold text-white">
          {(cloud.user.displayName || cloud.user.email || '?')[0]}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">{cloud.user.displayName || cloud.user.email}</span>
        <span className="block text-[10px] text-neutral-400">
          {cloud.syncState === 'error' ? 'Sync problem' : cloud.syncState === 'syncing' ? 'Syncing…' : 'Synced'}
        </span>
      </span>
    </a>
  )
}

/** Desktop / tablet sidebar. */
export function Sidebar({ path }) {
  return (
    <nav className="hidden h-full min-h-0 flex-col border-r border-black/10 px-3 pt-7 pb-4 md:row-start-1 md:flex">
      <NavContents path={path} />
    </nav>
  )
}

/** Phone: slide-in drawer with the same contents. */
export function Drawer({ path }) {
  const { drawerOpen, setDrawerOpen } = useUi()
  const close = () => setDrawerOpen(false)
  return (
    <AnimatePresence>
      {drawerOpen && (
        <motion.div className="fixed inset-0 z-[65] md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={close} />
          <motion.nav
            className="absolute inset-y-0 left-0 flex w-[82vw] max-w-[320px] flex-col bg-[#F2F2F2] px-3 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="absolute top-[max(env(safe-area-inset-top),16px)] right-3 grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
            <NavContents path={path} onNavigate={close} />
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Phone top bar: menu, wordmark, search. */
export function MobileTopBar() {
  const { setDrawerOpen } = useUi()
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between bg-[#F2F2F2]/85 px-2 pt-[max(env(safe-area-inset-top),6px)] pb-1 backdrop-blur-xl md:hidden">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5"
      >
        <Menu size={20} strokeWidth={1.5} />
      </button>
      <a href={href('/')} className="text-[15px] font-black tracking-tight uppercase">
        Mono<span className="font-serif text-[18px] font-normal normal-case italic text-neutral-400">music</span>
      </a>
      <a href={href('/search')} aria-label="Search" className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5">
        <Search size={19} strokeWidth={1.5} />
      </a>
    </div>
  )
}

function NavLink({ to, active, icon: Icon, children, small, onClick }) {
  return (
    <a
      href={href(to)}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 transition-colors ${small ? 'py-2 text-[13px]' : 'py-2.5 text-[14px]'} ${
        active ? 'bg-[#111] font-semibold text-white' : 'font-medium text-[#111]/70 hover:bg-black/5 hover:text-[#111]'
      }`}
    >
      <Icon size={small ? 15 : 18} strokeWidth={1.5} className="shrink-0" />
      <span className="truncate">{children}</span>
    </a>
  )
}

function PlaylistLink({ to, active, name, count, icon: Icon, tracks, onClick }) {
  return (
    <li>
      <a
        href={href(to)}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-xl p-1.5 pr-3 transition-colors ${
          active ? 'bg-black/[0.07]' : 'hover:bg-black/[0.04]'
        }`}
      >
        {Icon ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#111] text-white">
            <Icon size={16} strokeWidth={1.5} />
          </span>
        ) : tracks?.length ? (
          <Artwork track={tracks[0]} className="h-10 w-10 shrink-0 rounded-lg" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-black/10 text-[11px] font-black uppercase">
            {name.slice(0, 2)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] tracking-tight ${active ? 'font-bold' : 'font-semibold'}`}>{name}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{count} songs</span>
        </span>
      </a>
    </li>
  )
}

/** Mobile bottom tab bar. */
export function TabBar({ path }) {
  const tabs = LINKS.slice(0, 3).concat({ to: '/settings', label: 'Settings', icon: Settings, match: (p) => p === '/settings' })
  return (
    <nav className="grid grid-cols-4 bg-[#F2F2F2]/85 pb-[max(env(safe-area-inset-bottom),6px)] backdrop-blur-xl md:hidden">
      {tabs.map(({ to, label, icon: Icon, match }) => {
        const active = match(path)
        return (
          <a
            key={to}
            href={href(to)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1 pt-2 pb-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${
              active ? 'text-[#111]' : 'text-neutral-400'
            }`}
          >
            {active && (
              <motion.span layoutId="tab-dot" className="absolute top-0 h-[3px] w-6 rounded-b-full bg-[#111]" />
            )}
            <Icon size={22} strokeWidth={active ? 1.75 : 1.25} />
            {label}
          </a>
        )
      })}
    </nav>
  )
}
