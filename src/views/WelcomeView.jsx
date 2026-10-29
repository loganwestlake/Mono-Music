import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Artwork from '../components/Artwork'
import { Eyebrow, PillButton } from '../components/ui'
import { topArtists } from '../lib/artists'
import { navigate } from '../lib/router'
import { useLibrary } from '../store/library'

// Absolute placement for each floating blob inside the hero canvas.
const LAYOUT = [
  { shape: 'blob-a', className: 'left-[2%] top-[8%] h-[46%] w-[42%]', drift: [0, -10], delay: 0 },
  { shape: 'blob-b', className: 'right-[0%] top-[0%] h-[58%] w-[50%]', drift: [0, 12], delay: 0.8 },
  { shape: 'blob-c', className: 'left-[24%] bottom-[0%] h-[50%] w-[46%]', drift: [0, -8], delay: 1.6 },
]

export default function WelcomeView() {
  const [artists, setArtists] = useState([])
  const { profile, updateProfile } = useLibrary()
  const [name, setName] = useState(profile.name)

  useEffect(() => {
    topArtists().then((list) => setArtists(list.filter((a) => a.picture).slice(0, 3)))
  }, [])

  const start = (e) => {
    e.preventDefault()
    updateProfile({ name: name.trim() })
    navigate('/welcome/artists')
  }

  const skip = () => {
    updateProfile({ name: name.trim(), onboarded: true })
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),28px)] md:px-12">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-black tracking-tight uppercase">
          Mono<span className="text-neutral-400">.</span>
        </span>
        <Eyebrow>Vol. 01</Eyebrow>
      </div>

      <div className="flex flex-1 flex-col md:grid md:grid-cols-2 md:items-center md:gap-12">
        {/* Floating organic portraits */}
        <div className="relative mx-auto mt-6 aspect-[1/1.05] w-full max-w-[420px] md:mt-0 md:max-w-[520px]">
          {LAYOUT.map(({ shape, className, drift, delay }, i) => {
            const artist = artists[i]
            return (
              <motion.div
                key={shape}
                className={`absolute ${className}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, y: drift, rotate: [0, i % 2 ? 2 : -2] }}
                transition={{
                  opacity: { duration: 0.8, delay: i * 0.15 },
                  scale: { duration: 0.8, delay: i * 0.15 },
                  y: { duration: 6, delay, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
                  rotate: { duration: 8, delay, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
                }}
              >
                <Artwork
                  src={artist?.picture}
                  name={artist?.name ?? ['M', 'O', 'N'][i]}
                  shape={shape}
                  className="h-full w-full shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)]"
                />
              </motion.div>
            )
          })}
        </div>

        <motion.form
          onSubmit={start}
          className="mt-auto pt-10 md:mt-0 md:pt-0"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-[44px] leading-[0.95] font-black tracking-tight text-[#111] md:text-[72px]">
            Elevate Every Moment With Music
          </h1>
          <p className="mt-4 text-[10px] font-light uppercase tracking-widest text-neutral-400 md:text-[11px]">
            Millions of tracks. No colour. No noise.
          </p>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
            autoComplete="given-name"
            className="mt-10 h-14 w-full rounded-full border border-black/10 bg-white px-6 text-[15px] outline-none placeholder:text-neutral-400 focus:border-black/40"
          />
          <PillButton type="submit" className="mt-3 h-14 w-full">
            Get Started
          </PillButton>
          <button
            type="button"
            onClick={skip}
            className="mt-4 w-full text-center text-[10px] font-semibold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
          >
            Skip for now
          </button>
        </motion.form>
      </div>
    </div>
  )
}
