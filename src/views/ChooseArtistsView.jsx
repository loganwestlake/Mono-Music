import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check } from 'lucide-react'
import Artwork from '../components/Artwork'
import { Eyebrow, IconButton, PillButton, Spinner } from '../components/ui'
import { topArtists } from '../lib/artists'
import { navigate } from '../lib/router'
import { useLibrary } from '../store/library'

export default function ChooseArtistsView() {
  const { profile, updateProfile } = useLibrary()
  const [artists, setArtists] = useState(null)
  const [selected, setSelected] = useState(() => new Set(profile.artists.map((a) => a.name)))

  useEffect(() => {
    topArtists().then((list) => {
      // Keep previously chosen artists visible even if they left the chart.
      const extra = profile.artists.filter((a) => !list.some((b) => b.name === a.name))
      setArtists([...extra, ...list])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (name) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  const finish = () => {
    updateProfile({ onboarded: true, artists: (artists ?? []).filter((a) => selected.has(a.name)) })
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col">
      <header className="grid grid-cols-[44px_1fr_44px] items-center px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => navigate(profile.onboarded ? '/settings' : '/welcome')} />
        <h1 className="text-center text-[11px] font-semibold uppercase tracking-widest">Your Playlist</h1>
        <span />
      </header>

      <div className="px-6 pt-8 md:px-10">
        <h2 className="text-[34px] leading-[0.95] font-black tracking-tight md:text-[56px]">
          Choose Your
          <br />
          Favorite Artist
        </h2>
        <Eyebrow className="mt-3">Pick three or more · {selected.size} selected</Eyebrow>
      </div>

      {!artists ? (
        <div className="mt-24 flex justify-center text-neutral-400">
          <Spinner />
        </div>
      ) : (
        /* Staggered grid: every fifth avatar spans 2×2, the rest flow around it. */
        <ul className="mt-8 grid grid-flow-dense grid-cols-3 gap-x-4 gap-y-6 px-6 pb-40 sm:grid-cols-4 md:grid-cols-6 md:px-10">
          {artists.map((artist, i) => (
            <ArtistAvatar
              key={artist.name}
              artist={artist}
              large={i % 5 === 0}
              index={i}
              selected={selected.has(artist.name)}
              onToggle={() => toggle(artist.name)}
            />
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#F2F2F2] via-[#F2F2F2] to-transparent px-6 pt-10 pb-[max(env(safe-area-inset-bottom),28px)]">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <PillButton onClick={finish} className="h-14 w-full">
            {selected.size ? 'Continue' : 'Skip'}
          </PillButton>
        </div>
      </div>
    </div>
  )
}

function ArtistAvatar({ artist, large, index, selected, onToggle }) {
  return (
    <motion.li
      className={large ? 'col-span-2 row-span-2' : ''}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index, 20) * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      <button type="button" onClick={onToggle} aria-pressed={selected} className="group flex w-full flex-col items-center">
        <motion.div
          whileTap={{ scale: 0.95 }}
          className={`relative aspect-square w-full rounded-full p-[3px] ring-1 transition ${selected ? 'ring-[#111]' : 'ring-transparent'}`}
        >
          <Artwork
            src={artist.picture}
            name={artist.name}
            shape="circle"
            className="h-full w-full"
            imgClassName={selected ? 'contrast-[1.25]' : 'opacity-90 group-hover:opacity-100'}
          />
          <AnimatePresence>
            {selected && (
              <motion.span
                className={`absolute grid place-items-center rounded-full bg-[#111] text-white ${
                  large ? 'right-3 bottom-3 h-8 w-8' : 'right-0 bottom-0 h-6 w-6'
                }`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Check size={large ? 16 : 12} strokeWidth={2} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
        <span
          className={`mt-2 text-center tracking-tight ${large ? 'text-[13px]' : 'text-[11px]'} ${
            selected ? 'font-semibold text-[#111]' : 'font-medium text-[#111]/70'
          }`}
        >
          {artist.name}
        </span>
      </button>
    </motion.li>
  )
}
