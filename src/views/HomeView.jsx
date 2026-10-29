import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Flame, Play, RefreshCw, Search, Sparkles } from 'lucide-react'
import Artwork from '../components/Artwork'
import TrackRow from '../components/TrackRow'
import { Eyebrow, PillButton, Spinner } from '../components/ui'
import { chartTracks, recommendations } from '../lib/deezer'
import { FEATURED, GENRES } from '../lib/featured'
import { href, navigate } from '../lib/router'
import { formatTime } from '../lib/tracks'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function streak(days) {
  let n = 0
  const d = new Date()
  for (;;) {
    const iso = d.toISOString().slice(0, 10)
    if (!days.includes(iso)) break
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export default function HomeView() {
  const library = useLibrary()
  const { profile, recent, liked, listening } = library
  const player = usePlayer()
  const days = streak(listening.days)
  const hours = Math.floor(listening.seconds / 3600)
  const mins = Math.floor((listening.seconds % 3600) / 60)
  let n = 0
  const next = () => String(++n).padStart(2, '0')

  return (
    <div className="pb-16">
      {/* Masthead */}
      <header className="px-5 pt-6 md:px-10 md:pt-12">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Eyebrow>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Eyebrow>
          {days > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[#111] px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-white">
              <Flame size={10} /> {days}-day streak
            </span>
          )}
          {listening.seconds > 60 && (
            <Eyebrow>
              {hours ? `${hours}h ` : ''}
              {mins}m listened
            </Eyebrow>
          )}
        </div>
        <h1 className="mt-3 text-[52px] leading-[0.88] font-black tracking-[-0.04em] text-[#111] md:text-[88px]">
          <span className="font-serif font-normal tracking-[-0.02em] italic">{greeting()},</span>
          <br />
          {profile.name || 'listener'}.
        </h1>

        <a
          href={href('/search')}
          className="mt-8 flex h-14 max-w-2xl items-center gap-3 rounded-full border border-black/10 bg-white px-5 text-[14px] text-neutral-400 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.4)] transition hover:border-black/30"
        >
          <Search size={18} strokeWidth={1.5} className="text-[#111]" />
          <span className="flex-1 truncate">Search songs, artists, or paste a YouTube link</span>
          <kbd className="hidden rounded-md border border-black/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold md:block">/</kbd>
        </a>
      </header>

      {player.current && <ContinueCard />}

      <Ticker />

      <div className="px-5 md:px-10">
        <ForYou index={next()} />

        {recent.length > 0 && (
          <Section index={next()} title="Jump back in" action={<SeeAll to="/recent" />}>
            <Shelf tracks={recent.slice(0, 14)} />
          </Section>
        )}

        <TopChart index={next()} />

        {profile.artists.length > 0 && (
          <Section index={next()} title="Your artists">
            <div className="no-scrollbar -mx-5 flex gap-5 overflow-x-auto px-5 md:-mx-10 md:px-10">
              {profile.artists.map((a) => (
                <a key={a.name} href={href(`/artist/${encodeURIComponent(a.name)}`)} className="group w-24 shrink-0 text-center md:w-32">
                  <Artwork src={a.picture} name={a.name} shape="circle" className="aspect-square w-full transition duration-500 group-hover:scale-[1.04]" />
                  <span className="mt-2 block truncate text-[12px] font-semibold tracking-tight">{a.name}</span>
                </a>
              ))}
            </div>
          </Section>
        )}

        <Section
          index={next()}
          title="Featured"
          action={
            <PillButton variant="outline" icon={Play} className="h-9 px-4" onClick={() => player.playTracks(FEATURED, 0)}>
              Play all
            </PillButton>
          }
        >
          <ul className="-mx-2 grid gap-x-6 lg:grid-cols-2">
            {FEATURED.map((t, i) => (
              <TrackRow key={t.id} track={t} list={FEATURED} index={i} />
            ))}
          </ul>
        </Section>

        <Section index={next()} title="Browse moods">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {GENRES.map((g, i) => (
              <motion.button
                key={g}
                type="button"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/search?q=${encodeURIComponent(`${g} music`)}`)}
                className={`relative flex h-24 items-end overflow-hidden rounded-2xl p-4 text-left ${
                  i % 3 === 0 ? 'bg-[#111] text-white' : i % 3 === 1 ? 'bg-white' : 'border border-black/10'
                }`}
              >
                <span className="text-[20px] font-black tracking-tight">{g}</span>
                <span className="absolute top-2 right-3 font-serif text-[40px] leading-none italic opacity-15">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </motion.button>
            ))}
          </div>
        </Section>

        {liked.length > 0 && (
          <Section index={next()} title="Liked songs" action={<SeeAll to="/liked" />}>
            <Shelf tracks={liked.slice(0, 14)} />
          </Section>
        )}
      </div>
    </div>
  )
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

function Section({ index, title, action, children, subtitle }) {
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-black/10 pb-3">
        <div className="min-w-0">
          <h2 className="flex items-baseline gap-3 text-[24px] leading-none font-black tracking-tight md:text-[30px]">
            <span className="font-serif text-[18px] font-normal text-neutral-400 italic md:text-[22px]">{index}</span>
            {title}
          </h2>
          {subtitle && <p className="mt-2 truncate text-[12px] text-neutral-400">{subtitle}</p>}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {children}
    </section>
  )
}

function SeeAll({ to }) {
  return (
    <a href={href(to)} className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]">
      See all
    </a>
  )
}

const SHAPES = ['blob-a', 'blob-b', 'blob-c', 'blob-d']

/** Horizontal row of organic artwork cards. */
function Shelf({ tracks }) {
  const player = usePlayer()
  return (
    <div className="no-scrollbar -mx-5 flex gap-5 overflow-x-auto px-5 pb-2 md:-mx-10 md:px-10">
      {tracks.map((t, i) => (
        <motion.button
          key={`${t.id}-${i}`}
          type="button"
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => player.playTracks(tracks, i)}
          className="group w-36 shrink-0 text-left md:w-48"
        >
          <div className="relative">
            <Artwork track={t} shape={SHAPES[i % SHAPES.length]} className="aspect-square w-full shadow-[0_18px_30px_-18px_rgba(0,0,0,0.55)]" />
            <span className="absolute right-2 bottom-2 grid h-10 w-10 translate-y-2 place-items-center rounded-full bg-[#111] text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
              <Play size={15} fill="currentColor" strokeWidth={1} className="translate-x-[1px]" />
            </span>
          </div>
          <span className="mt-3 block truncate text-[13px] font-bold tracking-tight">{t.title}</span>
          <Eyebrow className="mt-0.5 truncate">{t.artist}</Eyebrow>
        </motion.button>
      ))}
    </div>
  )
}

function ContinueCard() {
  const p = usePlayer()
  const t = p.current
  return (
    <div className="px-5 pt-10 md:px-10">
      <motion.div
        layout
        className="relative flex items-center gap-5 overflow-hidden rounded-[28px] bg-[#111] p-4 pr-6 text-white md:p-5 md:pr-8"
      >
        <Artwork track={t} shape="blob-b" className="h-20 w-20 shrink-0 md:h-24 md:w-24" />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">{p.playing ? 'Now playing' : 'Continue listening'}</p>
          <p className="mt-1 truncate text-[22px] leading-tight font-black tracking-tight md:text-[28px]">{t.title}</p>
          <p className="truncate font-serif text-[16px] text-white/60 italic">{t.artist}</p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={p.toggle}
          aria-label={p.playing ? 'Pause' : 'Play'}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-[#111]"
        >
          {p.playing ? (
            <span className="flex gap-1">
              <span className="h-4 w-1 rounded bg-current" />
              <span className="h-4 w-1 rounded bg-current" />
            </span>
          ) : (
            <Play size={20} fill="currentColor" strokeWidth={1} className="translate-x-[1px]" />
          )}
        </motion.button>
      </motion.div>
    </div>
  )
}

/** Editorial running ticker of what's charting. */
function Ticker() {
  const [names, setNames] = useState([])
  useEffect(() => {
    chartTracks(30)
      .then((t) => setNames([...new Set(t.map((x) => x.artist))].slice(0, 16)))
      .catch(() => setNames(['Mono Music', 'No colour', 'No noise', 'Only music']))
  }, [])
  if (!names.length) return null
  const row = names.map((n) => (
    <span key={n} className="flex items-center gap-8 pr-8">
      <span>{n}</span>
      <span className="font-serif text-[0.7em] font-normal text-neutral-400 italic">✶</span>
    </span>
  ))
  return (
    <div aria-hidden className="mt-12 overflow-hidden border-y border-black/10 py-4">
      <div className="animate-marquee flex w-max text-[28px] font-black tracking-tight whitespace-nowrap uppercase md:text-[40px]">
        {row}
        {row}
      </div>
    </div>
  )
}

function ForYou({ index }) {
  const library = useLibrary()
  const player = usePlayer()
  const [state, setState] = useState({ loading: true, tracks: [], seeds: [] })

  const load = useCallback(
    (fresh) => {
      const cacheKey = 'mono:for-you'
      if (!fresh) {
        try {
          const hit = JSON.parse(sessionStorage.getItem(cacheKey))
          if (hit && Date.now() - hit.at < 30 * 60 * 1000) return setState({ loading: false, ...hit })
        } catch {
          // ignore
        }
      }
      setState((s) => ({ ...s, loading: true }))
      recommendations({
        recent: library.recent,
        liked: library.liked,
        plays: library.plays,
        favourites: library.profile.artists,
      })
        .then(({ tracks, seeds }) => {
          setState({ loading: false, tracks, seeds })
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), tracks, seeds }))
          } catch {
            // ignore
          }
        })
        .catch(() => setState({ loading: false, tracks: [], seeds: [] }))
    },
    [library.recent, library.liked, library.plays, library.profile.artists],
  )

  useEffect(() => load(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  const subtitle = state.seeds.length
    ? `Because you listen to ${state.seeds.slice(0, 3).join(', ')}`
    : 'Play a few songs and this gets personal'

  return (
    <Section
      index={index}
      title={
        <span className="flex items-center gap-2">
          You might be interested in <Sparkles size={18} strokeWidth={1.5} />
        </span>
      }
      subtitle={subtitle}
      action={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh recommendations"
            title="Refresh"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5"
          >
            <RefreshCw size={15} strokeWidth={1.5} className={state.loading ? 'animate-spin' : ''} />
          </button>
          {state.tracks.length > 0 && (
            <PillButton variant="outline" icon={Play} className="h-9 px-4" onClick={() => player.playTracks(state.tracks, 0)}>
              Play
            </PillButton>
          )}
        </div>
      }
    >
      {state.loading && !state.tracks.length ? (
        <div className="flex h-48 items-center justify-center text-neutral-400">
          <Spinner />
        </div>
      ) : state.tracks.length ? (
        <Shelf tracks={state.tracks} />
      ) : (
        <p className="text-[13px] text-neutral-400">Recommendations are unavailable right now.</p>
      )}
    </Section>
  )
}

function TopChart({ index }) {
  const player = usePlayer()
  const [tracks, setTracks] = useState(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    chartTracks(50).then(setTracks).catch(() => setTracks([]))
  }, [])
  if (tracks && !tracks.length) return null

  const shown = all ? tracks : tracks?.slice(0, 10)
  return (
    <Section
      index={index}
      title="Top 50 · Global"
      subtitle="What the world is playing today"
      action={
        tracks?.length ? (
          <PillButton variant="outline" icon={Play} className="h-9 px-4" onClick={() => player.playTracks(tracks, 0)}>
            Play
          </PillButton>
        ) : null
      }
    >
      {!tracks ? (
        <div className="flex h-32 items-center justify-center text-neutral-400">
          <Spinner />
        </div>
      ) : (
        <>
          <ol className="grid gap-x-8 md:grid-cols-2">
            {shown.map((t, i) => {
              const isCurrent = player.current?.title === t.title && player.current?.artist === t.artist
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => player.playTracks(tracks, i)}
                    className="group flex w-full items-center gap-4 border-b border-black/5 py-2.5 text-left"
                  >
                    <span className="w-8 shrink-0 font-serif text-[24px] leading-none text-neutral-400 italic tabular-nums">
                      {i + 1}
                    </span>
                    <Artwork track={t} className="h-12 w-12 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14px] tracking-tight ${isCurrent ? 'font-black' : 'font-semibold'} group-hover:underline`}>
                        {t.title}
                      </span>
                      <span className="block truncate text-[12px] text-neutral-400">{t.artist}</span>
                    </span>
                    <span className="hidden text-[11px] text-neutral-400 tabular-nums sm:block">{formatTime(t.duration)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
          {tracks.length > 10 && (
            <button
              type="button"
              onClick={() => setAll((a) => !a)}
              className="mt-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
            >
              {all ? 'Show top 10' : 'Show all 50'}
            </button>
          )}
        </>
      )}
    </Section>
  )
}
