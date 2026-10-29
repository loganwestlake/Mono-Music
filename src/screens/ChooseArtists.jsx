import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check } from 'lucide-react'
import { Eyebrow, IconButton, PillButton, ScreenHeader, hideBroken } from '../components/ui'
import { ARTISTS } from '../lib/data'

export default function ChooseArtists({ onBack, onContinue }) {
  const [selected, setSelected] = useState(() => new Set())

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="flex min-h-dvh flex-col sm:min-h-[860px]">
      <ScreenHeader
        left={<IconButton icon={ArrowLeft} label="Back" onClick={onBack} />}
        title="Your Playlist"
      />

      <div className="px-6 pt-8">
        <h2 className="text-[34px] leading-[0.95] font-black tracking-tight">
          Choose Your
          <br />
          Favorite Artist
        </h2>
        <Eyebrow className="mt-3">Pick three or more · {selected.size} selected</Eyebrow>
      </div>

      {/* Staggered grid: large avatars span 2×2, the rest flow around them. */}
      <ul className="mt-8 grid grid-flow-dense grid-cols-3 gap-x-4 gap-y-6 px-6 pb-36">
        {ARTISTS.map((artist, i) => (
          <ArtistAvatar
            key={artist.id}
            artist={artist}
            index={i}
            selected={selected.has(artist.id)}
            onToggle={() => toggle(artist.id)}
          />
        ))}
      </ul>

      {/* Sticky CTA fades in once there's a selection. */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            className="fixed inset-x-0 bottom-0 mx-auto max-w-[430px] bg-gradient-to-t from-[#F2F2F2] via-[#F2F2F2] to-transparent px-6 pt-10 pb-[max(env(safe-area-inset-bottom),28px)]"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
          >
            <PillButton onClick={onContinue}>Continue</PillButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ArtistAvatar({ artist, index, selected, onToggle }) {
  const large = artist.size === 'lg'

  return (
    <motion.li
      className={large ? 'col-span-2 row-span-2' : ''}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className="group flex w-full flex-col items-center"
      >
        <motion.div
          whileTap={{ scale: 0.95 }}
          className={`relative aspect-square w-full rounded-full p-[3px] ring-1 transition-[box-shadow] ${
            selected ? 'ring-[#111]' : 'ring-transparent'
          }`}
        >
          <img
            src={artist.src}
            alt=""
            loading="lazy"
            draggable={false}
            onError={hideBroken}
            className={`h-full w-full rounded-full bg-neutral-300 object-cover grayscale transition duration-500 ${
              selected ? 'contrast-[1.2]' : 'opacity-90 group-hover:opacity-100'
            }`}
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
