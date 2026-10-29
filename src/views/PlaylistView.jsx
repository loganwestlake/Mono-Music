import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpDown, CopyPlus, FileDown, MoreHorizontal, Pencil, Play, Search, Shuffle, Trash2, Wand2 } from 'lucide-react'
import Artwork from '../components/Artwork'
import Menu from '../components/Menu'
import TrackRow from '../components/TrackRow'
import { EmptyState, Eyebrow, IconButton, PillButton } from '../components/ui'
import { navigate } from '../lib/router'
import { formatTime, isUnresolved, shuffled } from '../lib/tracks'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'
import { useResolver } from '../store/resolver'
import { useToast } from '../store/toast'

const SORTS = {
  custom: { label: 'Custom order', fn: null },
  title: { label: 'Title', fn: (a, b) => a.title.localeCompare(b.title) },
  artist: { label: 'Artist', fn: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title) },
  duration: { label: 'Duration', fn: (a, b) => (a.duration || 0) - (b.duration || 0) },
}

/** Liked Songs, Recently Played, or a user playlist (`kind` = liked | recent | playlist). */
export default function PlaylistView({ kind, id }) {
  const library = useLibrary()
  const player = usePlayer()
  const toast = useToast()
  const { resolveAll } = useResolver()
  const [editing, setEditing] = useState(false)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('custom')

  const playlist = kind === 'playlist' ? library.playlists.find((p) => p.id === id) : null
  const title = kind === 'liked' ? 'Liked Songs' : kind === 'recent' ? 'Recently Played' : playlist?.name
  const tracks = useMemo(
    () => (kind === 'liked' ? library.liked : kind === 'recent' ? library.recent : (playlist?.tracks ?? [])),
    [kind, library.liked, library.recent, playlist],
  )

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase()
    let list = term ? tracks.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(term)) : tracks
    if (SORTS[sort].fn) list = [...list].sort(SORTS[sort].fn)
    return list
  }, [tracks, filter, sort])

  if (kind === 'playlist' && !playlist) {
    return (
      <EmptyState
        title="Playlist not found"
        action={
          <PillButton variant="outline" onClick={() => navigate('/library')}>
            Back to library
          </PillButton>
        }
      />
    )
  }

  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0)
  const unmatched = tracks.filter(isUnresolved).length

  const rename = (e) => {
    e.preventDefault()
    const name = new FormData(e.currentTarget).get('name').toString().trim()
    if (name) library.renamePlaylist(id, name)
    setEditing(false)
  }

  const remove = () => {
    const copy = playlist
    library.deletePlaylist(id)
    navigate('/library')
    toast(`Deleted “${copy.name}”`, { action: { label: 'Undo', run: () => library.restorePlaylist(copy) } })
  }

  const removeTrack = (t) => {
    const at = playlist.tracks.findIndex((x) => x.id === t.id)
    library.removeFromPlaylist(id, t.id)
    toast(`Removed “${t.title}”`, { action: { label: 'Undo', run: () => library.insertInPlaylist(id, t, at) } })
  }

  const duplicate = () => {
    const newId = library.createPlaylist(`${title} (copy)`, tracks)
    navigate(`/playlist/${newId}`)
    toast('Playlist duplicated')
  }

  const exportCsv = () => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const rows = [['Track Name', 'Artist Name(s)', 'Duration (ms)', 'YouTube ID'], ...tracks.map((t) => [t.title, t.artist, (t.duration || 0) * 1000, isUnresolved(t) ? '' : t.id])]
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${title}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const saveOrder = () => {
    library.setPlaylistTracks(id, visible.length === tracks.length ? visible : tracks)
    setSort('custom')
    toast('Order saved')
  }

  return (
    <div className="pb-16">
      <header className="px-5 pt-6 md:px-10 md:pt-10">
        <IconButton icon={ArrowLeft} label="Back to library" onClick={() => navigate('/library')} className="-ml-3" />

        <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:gap-10">
          <Cover tracks={tracks} kind={kind} />
          <div className="min-w-0 flex-1">
            <Eyebrow className="mb-2">
              {kind === 'playlist' ? `Playlist${playlist.source ? ` · from ${playlist.source}` : ''}` : 'Collection'}
            </Eyebrow>
            {editing ? (
              <form onSubmit={rename}>
                <input
                  name="name"
                  defaultValue={playlist.name}
                  autoFocus
                  onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                  className="w-full border-b-2 border-[#111] bg-transparent text-[44px] leading-tight font-black tracking-tight outline-none md:text-[72px]"
                />
              </form>
            ) : (
              <h1
                onDoubleClick={() => kind === 'playlist' && setEditing(true)}
                className="text-[44px] leading-[0.9] font-black tracking-[-0.035em] break-words md:text-[72px]"
              >
                {title}
              </h1>
            )}
            <p className="mt-3 font-serif text-[17px] text-neutral-500 italic">
              {tracks.length} songs{total ? ` · ${formatTime(total)}` : ''}
              {unmatched ? ` · ${unmatched} still matching` : ''}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <PillButton icon={Play} disabled={!tracks.length} onClick={() => player.playTracks(visible, 0)}>
            Play
          </PillButton>
          <PillButton variant="outline" icon={Shuffle} disabled={!tracks.length} onClick={() => player.playTracks(shuffled(visible), 0)}>
            Shuffle
          </PillButton>

          <div className="ml-auto flex items-center gap-1">
            <label className="flex h-10 items-center gap-2 rounded-full border border-black/10 px-3 focus-within:border-black/40">
              <Search size={14} strokeWidth={1.5} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter"
                className="w-24 bg-transparent text-[13px] outline-none placeholder:text-neutral-400 md:w-36"
              />
            </label>
            <Menu
              icon={ArrowUpDown}
              label="Sort"
              active={sort !== 'custom'}
              items={[
                { heading: 'Sort by' },
                ...Object.entries(SORTS).map(([key, s]) => ({ label: s.label, checked: sort === key, run: () => setSort(key) })),
                kind === 'playlist' && sort !== 'custom' && 'divider',
                kind === 'playlist' && sort !== 'custom' && { label: 'Save this order', run: saveOrder },
              ]}
            />
            <Menu
              icon={MoreHorizontal}
              label="Playlist options"
              items={[
                kind === 'playlist' && { icon: Pencil, label: 'Rename', run: () => setEditing(true) },
                { icon: CopyPlus, label: 'Duplicate', run: duplicate },
                { icon: FileDown, label: 'Export CSV', run: exportCsv },
                unmatched > 0 && { icon: Wand2, label: `Match ${unmatched} songs now`, run: () => resolveAll(tracks, `Matching “${title}”`) },
                kind === 'recent' && tracks.length > 0 && { icon: Trash2, label: 'Clear history', run: library.clearRecent },
                kind === 'playlist' && 'divider',
                kind === 'playlist' && { icon: Trash2, label: 'Delete playlist', run: remove },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="px-5 md:px-10">
        {tracks.length === 0 ? (
          <EmptyState
            title={kind === 'liked' ? 'No liked songs yet' : kind === 'recent' ? 'Nothing played yet' : 'This playlist is empty'}
            action={
              <PillButton variant="outline" onClick={() => navigate('/search')}>
                Find songs
              </PillButton>
            }
          >
            {kind === 'liked'
              ? 'Tap the heart on any song to save it here.'
              : kind === 'playlist'
                ? 'Use the ••• menu on any song and choose “Add to playlist”.'
                : null}
          </EmptyState>
        ) : (
          <ul className="-mx-2 mt-8">
            {visible.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                list={visible}
                index={i}
                number={i + 1}
                onRemove={kind === 'playlist' ? () => removeTrack(t) : undefined}
              />
            ))}
            {visible.length === 0 && <li className="py-10 text-center text-[13px] text-neutral-400">No songs match “{filter}”.</li>}
          </ul>
        )}
      </div>
    </div>
  )
}

function Cover({ tracks, kind }) {
  const tiles = tracks.slice(0, 4)
  return (
    <div className="h-48 w-48 shrink-0 overflow-hidden rounded-[28px] bg-[#111] shadow-[0_30px_50px_-28px_rgba(0,0,0,0.6)] md:h-60 md:w-60">
      {tiles.length >= 4 ? (
        <div className="grid h-full grid-cols-2">
          {tiles.map((t) => (
            <Artwork key={t.id} track={t} shape="none" className="h-full w-full" />
          ))}
        </div>
      ) : tiles.length ? (
        <Artwork track={tiles[0]} shape="none" className="h-full w-full" />
      ) : (
        <div className="grid h-full place-items-center font-serif text-[64px] text-white/20 italic">
          {kind === 'liked' ? '♥' : '♪'}
        </div>
      )}
    </div>
  )
}
