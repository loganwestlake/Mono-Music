import { useState } from 'react'
import { ArrowLeft, Pencil, Play, Shuffle, Trash2 } from 'lucide-react'
import TrackRow from '../components/TrackRow'
import { EmptyState, Eyebrow, IconButton, PillButton } from '../components/ui'
import { navigate } from '../lib/router'
import { formatTime, shuffled } from '../lib/tracks'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'

/** Liked Songs, Recently Played, or a user playlist (`kind` = liked | recent | playlist). */
export default function PlaylistView({ kind, id }) {
  const library = useLibrary()
  const player = usePlayer()
  const [editing, setEditing] = useState(false)

  const playlist = kind === 'playlist' ? library.playlists.find((p) => p.id === id) : null
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

  const title = kind === 'liked' ? 'Liked Songs' : kind === 'recent' ? 'Recently Played' : playlist.name
  const tracks = kind === 'liked' ? library.liked : kind === 'recent' ? library.recent : playlist.tracks
  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0)

  const rename = (e) => {
    e.preventDefault()
    const name = new FormData(e.currentTarget).get('name').toString().trim()
    if (name) library.renamePlaylist(id, name)
    setEditing(false)
  }

  const remove = () => {
    if (!window.confirm(`Delete “${playlist.name}”? This can’t be undone.`)) return
    library.deletePlaylist(id)
    navigate('/library')
  }

  return (
    <div className="px-5 pt-6 pb-10 md:px-10 md:pt-10">
      <IconButton icon={ArrowLeft} label="Back to library" onClick={() => navigate('/library')} className="-ml-3" />

      <div className="mt-4">
        <Eyebrow className="mb-2">{kind === 'playlist' ? 'Playlist' : 'Collection'}</Eyebrow>
        {editing ? (
          <form onSubmit={rename} className="flex items-center gap-2">
            <input
              name="name"
              defaultValue={playlist.name}
              autoFocus
              onBlur={(e) => e.currentTarget.form?.requestSubmit()}
              className="min-w-0 flex-1 border-b-2 border-[#111] bg-transparent text-[40px] leading-tight font-black tracking-tight outline-none md:text-[56px]"
            />
          </form>
        ) : (
          <h1 className="flex items-center gap-2 text-[40px] leading-[0.95] font-black tracking-tight break-words md:text-[56px]">
            {title}
            {kind === 'playlist' && (
              <IconButton icon={Pencil} label="Rename playlist" onClick={() => setEditing(true)} size={16} className="h-9 w-9" />
            )}
          </h1>
        )}
        <Eyebrow className="mt-3">
          {tracks.length} songs{total ? ` · ${formatTime(total)}` : ''}
        </Eyebrow>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <PillButton icon={Play} disabled={!tracks.length} onClick={() => player.playTracks(tracks, 0)}>
          Play
        </PillButton>
        <PillButton variant="outline" icon={Shuffle} disabled={!tracks.length} onClick={() => player.playTracks(shuffled(tracks), 0)}>
          Shuffle
        </PillButton>
        {kind === 'playlist' && (
          <IconButton icon={Trash2} label="Delete playlist" onClick={remove} size={18} className="ml-auto" />
        )}
        {kind === 'recent' && tracks.length > 0 && (
          <button
            type="button"
            onClick={library.clearRecent}
            className="ml-auto text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
          >
            Clear history
          </button>
        )}
      </div>

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
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              list={tracks}
              index={i}
              number={i + 1}
              onRemove={kind === 'playlist' ? () => library.removeFromPlaylist(id, t.id) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
