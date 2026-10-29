import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import Artwork from '../components/Artwork'
import { EmptyState, Eyebrow, PillButton } from '../components/ui'
import { href, navigate } from '../lib/router'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'

/** "Your Stats": listening time, streaks, top songs and artists. */
export default function StatsView() {
  const { plays, listening, liked, playlists } = useLibrary()
  const player = usePlayer()

  const { topTracks, topArtists, totalPlays } = useMemo(() => {
    const all = Object.values(plays).filter((p) => p.track)
    const artists = new Map()
    all.forEach((p) => {
      const a = artists.get(p.track.artist) ?? { name: p.track.artist, count: 0, seconds: 0, track: p.track }
      a.count += p.count
      a.seconds += p.seconds
      artists.set(p.track.artist, a)
    })
    return {
      topTracks: [...all].sort((a, b) => b.count - a.count || b.seconds - a.seconds).slice(0, 10),
      topArtists: [...artists.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      totalPlays: all.reduce((s, p) => s + p.count, 0),
    }
  }, [plays])

  if (!totalPlays)
    return (
      <EmptyState
        title="No stats yet"
        action={
          <PillButton variant="outline" onClick={() => navigate('/')}>
            Start listening
          </PillButton>
        }
      >
        Play some music and your listening story will appear here.
      </EmptyState>
    )

  const hours = Math.floor(listening.seconds / 3600)
  const minutes = Math.floor((listening.seconds % 3600) / 60)
  const maxCount = topArtists[0]?.count || 1

  const figures = [
    [hours ? `${hours}h ${minutes}m` : `${minutes}m`, 'Listening time'],
    [totalPlays, 'Plays'],
    [listening.days.length, 'Days listened'],
    [Object.keys(plays).length, 'Different songs'],
    [liked.length, 'Liked'],
    [playlists.length, 'Playlists'],
  ]

  return (
    <div className="px-5 pt-6 pb-16 md:px-10 md:pt-12">
      <Eyebrow>Your listening, all time</Eyebrow>
      <h1 className="mt-2 text-[52px] leading-[0.88] font-black tracking-[-0.04em] md:text-[88px]">
        Your <span className="font-serif font-normal italic">story</span>
        <br />
        in sound.
      </h1>

      <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-black/10 md:grid-cols-3">
        {figures.map(([value, label], i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`p-6 ${i === 0 ? 'bg-[#111] text-white' : 'bg-[#F2F2F2]'}`}
          >
            <p className="text-[36px] leading-none font-black tracking-tight tabular-nums md:text-[48px]">{value}</p>
            <p className={`mt-2 text-[10px] font-bold uppercase tracking-widest ${i === 0 ? 'text-white/50' : 'text-neutral-400'}`}>{label}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-14 grid gap-14 lg:grid-cols-2">
        <section>
          <h2 className="mb-5 border-b border-black/10 pb-3 text-[24px] font-black tracking-tight">Top artists</h2>
          <ol className="space-y-3">
            {topArtists.map((a, i) => (
              <li key={a.name}>
                <a href={href(`/artist/${encodeURIComponent(a.name)}`)} className="group block">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="flex min-w-0 items-baseline gap-3">
                      <span className="font-serif text-[22px] text-neutral-400 italic">{i + 1}</span>
                      <span className="truncate text-[17px] font-bold tracking-tight group-hover:underline">{a.name}</span>
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-400 tabular-nums">{a.count} plays</span>
                  </div>
                  <div className="mt-2 h-[3px] rounded bg-black/5">
                    <motion.div
                      className="h-full rounded bg-[#111]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(a.count / maxCount) * 100}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                    />
                  </div>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <div className="mb-5 flex items-end justify-between border-b border-black/10 pb-3">
            <h2 className="text-[24px] font-black tracking-tight">Top songs</h2>
            <PillButton
              variant="outline"
              icon={Play}
              className="h-9 px-4"
              onClick={() => player.playTracks(topTracks.map((p) => p.track), 0)}
            >
              Play
            </PillButton>
          </div>
          <ol className="space-y-1">
            {topTracks.map((p, i) => (
              <li key={p.track.id}>
                <button
                  type="button"
                  onClick={() => player.playTracks(topTracks.map((x) => x.track), i)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-black/[0.04]"
                >
                  <span className="w-6 font-serif text-[18px] text-neutral-400 italic">{i + 1}</span>
                  <Artwork track={p.track} className="h-11 w-11 shrink-0 rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold tracking-tight">{p.track.title}</span>
                    <span className="block truncate text-[12px] text-neutral-400">{p.track.artist}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-400 tabular-nums">×{p.count}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
