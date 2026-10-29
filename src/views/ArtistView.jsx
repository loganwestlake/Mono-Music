import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Play, Radio, Search } from 'lucide-react'
import Artwork from '../components/Artwork'
import TrackRow from '../components/TrackRow'
import { EmptyState, Eyebrow, IconButton, PillButton, Spinner } from '../components/ui'
import { artistTop, findArtist, relatedArtists } from '../lib/deezer'
import { href, navigate } from '../lib/router'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'

/** Artist page: portrait, top songs, similar artists, radio. */
export default function ArtistView({ name }) {
  const player = usePlayer()
  const { plays } = useLibrary()
  const [state, setState] = useState({ loading: true, artist: null, top: [], related: [] })

  useEffect(() => {
    let alive = true
    setState({ loading: true, artist: null, top: [], related: [] })
    findArtist(name)
      .then(async (artist) => {
        if (!artist) return alive && setState({ loading: false, artist: null, top: [], related: [] })
        const [top, related] = await Promise.all([artistTop(artist.id, 20).catch(() => []), relatedArtists(artist.id, 12).catch(() => [])])
        if (alive) setState({ loading: false, artist, top, related })
      })
      .catch(() => alive && setState({ loading: false, artist: null, top: [], related: [] }))
    return () => {
      alive = false
    }
  }, [name])

  const yourPlays = Object.values(plays)
    .filter((p) => p.track?.artist?.toLowerCase() === name.toLowerCase())
    .reduce((s, p) => s + p.count, 0)

  if (state.loading)
    return (
      <div className="flex h-[60vh] items-center justify-center text-neutral-400">
        <Spinner />
      </div>
    )

  if (!state.artist)
    return (
      <EmptyState
        title={name}
        action={
          <PillButton variant="outline" icon={Search} onClick={() => navigate(`/search?q=${encodeURIComponent(name)}`)}>
            Search songs
          </PillButton>
        }
      >
        We couldn’t load this artist’s page right now.
      </EmptyState>
    )

  const { artist, top, related } = state
  return (
    <div className="pb-16">
      <header className="relative overflow-hidden px-5 pt-6 pb-10 md:px-10 md:pt-10">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => history.back()} className="-ml-3" />
        <div className="mt-4 flex flex-col gap-8 md:flex-row md:items-end">
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }}>
            <Artwork
              src={artist.picture}
              name={artist.name}
              shape="blob-a"
              className="h-56 w-56 shadow-[0_30px_50px_-25px_rgba(0,0,0,0.6)] md:h-72 md:w-72"
            />
          </motion.div>
          <div className="min-w-0">
            <Eyebrow>Artist{artist.fans ? ` · ${artist.fans.toLocaleString()} fans` : ''}</Eyebrow>
            <h1 className="mt-2 text-[56px] leading-[0.85] font-black tracking-[-0.04em] break-words md:text-[104px]">{artist.name}</h1>
            {yourPlays > 0 && (
              <p className="mt-3 font-serif text-[18px] text-neutral-500 italic">
                You’ve played them {yourPlays} time{yourPlays === 1 ? '' : 's'}.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <PillButton icon={Play} disabled={!top.length} onClick={() => player.playTracks(top, 0)}>
                Play
              </PillButton>
              <PillButton variant="outline" icon={Radio} onClick={() => player.startRadio({ artist: artist.name })}>
                Radio
              </PillButton>
            </div>
          </div>
        </div>
      </header>

      <div className="px-5 md:px-10">
        <h2 className="mb-4 border-b border-black/10 pb-3 text-[24px] font-black tracking-tight">Popular</h2>
        <ul className="-mx-2 grid gap-x-6 lg:grid-cols-2">
          {top.map((t, i) => (
            <TrackRow key={t.id} track={t} list={top} index={i} number={i + 1} />
          ))}
        </ul>

        {related.length > 0 && (
          <>
            <h2 className="mt-14 mb-5 border-b border-black/10 pb-3 text-[24px] font-black tracking-tight">
              Fans also <span className="font-serif font-normal italic">like</span>
            </h2>
            <div className="grid grid-cols-3 gap-5 sm:grid-cols-4 lg:grid-cols-6">
              {related.map((a) => (
                <a key={a.id} href={href(`/artist/${encodeURIComponent(a.name)}`)} className="group text-center">
                  <Artwork src={a.picture} name={a.name} shape="circle" className="aspect-square w-full transition duration-500 group-hover:scale-[1.04]" />
                  <span className="mt-2 block truncate text-[12px] font-semibold tracking-tight">{a.name}</span>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
