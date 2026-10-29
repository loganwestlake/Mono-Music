import { motion } from 'framer-motion'
import { Eyebrow, PillButton, hideBroken } from '../components/ui'
import { BLOBS } from '../lib/shapes'
import { ONBOARDING_BLOBS } from '../lib/data'

// Absolute placement for each floating blob inside the hero canvas.
const LAYOUT = [
  { shape: BLOBS.a, className: 'left-[4%] top-[6%] h-44 w-40', drift: [0, -10], delay: 0 },
  { shape: BLOBS.b, className: 'right-[2%] top-[0%] h-56 w-48', drift: [0, 12], delay: 0.8 },
  { shape: BLOBS.c, className: 'left-[26%] bottom-[0%] h-48 w-44', drift: [0, -8], delay: 1.6 },
]

export default function Onboarding({ onSignUp, onSignIn }) {
  return (
    <div className="flex min-h-dvh flex-col sm:min-h-[860px] px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),28px)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-black tracking-tight uppercase">Mono</span>
        <Eyebrow>Vol. 01</Eyebrow>
      </div>

      {/* Floating organic portraits */}
      <div className="relative mt-6 h-[380px]">
        {ONBOARDING_BLOBS.map((artist, i) => {
          const { shape, className, drift, delay } = LAYOUT[i]
          return (
            <motion.div
              key={artist.seed}
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
              <div
                className="h-full w-full overflow-hidden bg-neutral-300 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)]"
                style={{ borderRadius: shape }}
              >
                <img
                  src={artist.src}
                  alt={artist.name}
                  className="h-full w-full object-cover grayscale contrast-[1.1]"
                  draggable={false}
                  onError={hideBroken}
                />
              </div>
            </motion.div>
          )
        })}
      </div>

      <motion.div
        className="mt-auto pt-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-[44px] leading-[0.95] font-black tracking-tight text-[#111]">
          Elevate Every Moment With Music
        </h1>
        <p className="mt-4 text-[10px] font-light uppercase tracking-widest text-neutral-400">
          Millions of tracks. No colour. No noise.
        </p>

        <PillButton className="mt-10" onClick={onSignUp}>
          Sign Up
        </PillButton>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-4 w-full text-center text-[10px] font-semibold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
        >
          I already have an account
        </button>
      </motion.div>
    </div>
  )
}
