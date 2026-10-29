import { Heart, Home, Library, ListMusic, Plus, Search, Settings } from 'lucide-react'
import { href, navigate } from '../lib/router'
import { useLibrary } from '../store/library'

const LINKS = [
  { to: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  { to: '/search', label: 'Search', icon: Search, match: (p) => p.startsWith('/search') },
  { to: '/library', label: 'Library', icon: Library, match: (p) => p.startsWith('/library') || p.startsWith('/playlist') || p === '/liked' || p === '/recent' },
]

/** Desktop sidebar. */
export function Sidebar({ path }) {
  const { playlists, liked, createPlaylist } = useLibrary()

  const newPlaylist = () => {
    const id = createPlaylist(`Playlist ${playlists.length + 1}`)
    navigate(`/playlist/${id}`)
  }

  return (
    <nav className="no-scrollbar hidden h-full flex-col overflow-y-auto border-r border-black/10 px-4 pt-8 pb-6 lg:row-span-2 lg:flex">
      <a href={href('/')} className="px-3 text-[20px] font-black tracking-tight uppercase">
        Mono<span className="text-neutral-400">.</span>
      </a>

      <ul className="mt-8 space-y-1">
        {LINKS.map(({ to, label, icon: Icon, match }) => (
          <li key={to}>
            <NavLink to={to} active={match(path)} icon={Icon}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-center justify-between px-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Your playlists</p>
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
      <ul className="mt-2 space-y-0.5">
        <li>
          <NavLink to="/liked" active={path === '/liked'} icon={Heart} small>
            Liked Songs <span className="text-neutral-400">{liked.length}</span>
          </NavLink>
        </li>
        {playlists.map((p) => (
          <li key={p.id}>
            <NavLink to={`/playlist/${p.id}`} active={path === `/playlist/${p.id}`} icon={ListMusic} small>
              {p.name}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        <NavLink to="/settings" active={path === '/settings'} icon={Settings} small>
          Settings
        </NavLink>
      </div>
    </nav>
  )
}

function NavLink({ to, active, icon: Icon, children, small }) {
  return (
    <a
      href={href(to)}
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

/** Mobile bottom tab bar. */
export function TabBar({ path }) {
  const tabs = [...LINKS, { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p === '/settings' }]
  return (
    <nav className="grid grid-cols-4 border-t border-black/10 bg-[#F2F2F2] pb-[env(safe-area-inset-bottom)] lg:hidden">
      {tabs.map(({ to, label, icon: Icon, match }) => {
        const active = match(path)
        return (
          <a
            key={to}
            href={href(to)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-[9px] font-bold uppercase tracking-widest ${
              active ? 'text-[#111]' : 'text-neutral-400'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 1.75 : 1.25} />
            {label}
          </a>
        )
      })}
    </nav>
  )
}
