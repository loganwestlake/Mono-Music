import { useEffect, useRef, useState } from 'react'
import { Link2, Play, Search, X } from 'lucide-react'
import TrackRow from '../components/TrackRow'
import { EmptyState, Eyebrow, PageTitle, PillButton, Spinner } from '../components/ui'
import { GENRES } from '../lib/featured'
import { navigate } from '../lib/router'
import { searchTracks } from '../lib/search'
import { extractVideoId } from '../lib/tracks'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'

export default function SearchView({ params }) {
  const q = params.get('q') ?? ''
  const [input, setInput] = useState(q)
  const [state, setState] = useState({ status: 'idle', tracks: [], source: null, error: null })
  const { settings } = useLibrary()
  const player = usePlayer()
  const inputRef = useRef(null)

  useEffect(() => setInput(q), [q])

  // Focus the box on desktop, and when "/" is pressed anywhere.
  useEffect(() => {
    if (window.matchMedia('(hover: hover)').matches) inputRef.current?.focus()
  }, [])

  // Run the search whenever ?q= changes.
  useEffect(() => {
    if (!q.trim() || extractVideoId(q)) return setState({ status: 'idle', tracks: [], source: null, error: null })
    let alive = true
    setState((s) => ({ ...s, status: 'loading', error: null }))
    searchTracks(q, { apiKey: settings.apiKey })
      .then(({ tracks, source }) => alive && setState({ status: 'done', tracks, source, error: null }))
      .catch((err) => alive && setState({ status: 'error', tracks: [], source: null, error: err.message }))
    return () => {
      alive = false
    }
  }, [q, settings.apiKey])

  const linkId = extractVideoId(input)

  const submit = (e) => {
    e.preventDefault()
    const value = input.trim()
    if (!value) return
    if (linkId) {
      player.playTrack({ id: linkId, title: 'Loading…', artist: 'YouTube', pending: true })
      setInput('')
      return
    }
    navigate(`/search?q=${encodeURIComponent(value)}`)
  }

  return (
    <div className="px-5 pt-8 pb-10 md:px-10 md:pt-12">
      <PageTitle>Search</PageTitle>

      <form onSubmit={submit} className="sticky top-0 z-10 -mx-5 mt-6 bg-[#F2F2F2]/95 px-5 py-3 backdrop-blur md:-mx-10 md:px-10">
        <div className="flex h-14 items-center gap-3 rounded-full border border-black/10 bg-white px-5 focus-within:border-black/40">
          {linkId ? <Link2 size={18} strokeWidth={1.5} /> : <Search size={18} strokeWidth={1.5} />}
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Songs, artists, or a YouTube link"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-400 [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button type="button" aria-label="Clear" onClick={() => setInput('')} className="text-neutral-400 hover:text-[#111]">
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
          <button
            type="submit"
            className="hidden h-9 rounded-full bg-[#111] px-4 text-[10px] font-bold uppercase tracking-widest text-white sm:block"
          >
            {linkId ? 'Play link' : 'Search'}
          </button>
        </div>
        {linkId && <Eyebrow className="mt-2 px-5">YouTube link detected — press Enter to play it</Eyebrow>}
      </form>

      {state.status === 'idle' && (
        <div className="mt-8">
          <Eyebrow className="mb-3">Try a mood</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => navigate(`/search?q=${encodeURIComponent(`${g} music`)}`)}
                className="rounded-full border border-black/10 px-4 py-2 text-[12px] font-semibold tracking-tight transition hover:bg-[#111] hover:text-white"
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="mt-16 flex justify-center text-neutral-400">
          <Spinner />
        </div>
      )}

      {state.status === 'error' && (
        <EmptyState
          title="Search unavailable"
          action={
            <PillButton variant="outline" onClick={() => navigate('/settings')}>
              Open settings
            </PillButton>
          }
        >
          {state.error}
        </EmptyState>
      )}

      {state.status === 'done' && state.tracks.length === 0 && (
        <EmptyState title="No results">Try a different spelling, or paste a YouTube link.</EmptyState>
      )}

      {state.status === 'done' && state.tracks.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>
              {state.tracks.length} results for “{q}”
            </Eyebrow>
            <PillButton variant="outline" icon={Play} className="h-9 px-4" onClick={() => player.playTracks(state.tracks, 0)}>
              Play all
            </PillButton>
          </div>
          <ul className="-mx-2">
            {state.tracks.map((t, i) => (
              <TrackRow key={t.id} track={t} list={state.tracks} index={i} number={i + 1} />
            ))}
          </ul>
          <p className="mt-6 text-center text-[9px] uppercase tracking-widest text-neutral-400">Results via {state.source}</p>
        </section>
      )}
    </div>
  )
}
