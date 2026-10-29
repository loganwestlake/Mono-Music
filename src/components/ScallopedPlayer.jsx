import { motion, useReducedMotion } from 'framer-motion'
import { scallopPolygon } from '../lib/shapes'
import { thumbUrl } from '../lib/tracks'

// Two scallop outlines, offset by half a petal. Morphing between them makes
// the edge ripple slowly, like a flower breathing.
const SHAPE_A = scallopPolygon({ petals: 12, depth: 0.035, phase: 0 })
const SHAPE_B = scallopPolygon({ petals: 12, depth: 0.045, phase: Math.PI / 12 })

const BREATH = { duration: 7, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }

/**
 * The centrepiece: a scalloped, monochrome window onto the YouTube player.
 *
 * `mountRef` receives the element the YouTube <iframe> lives in. It is
 * oversized and centred so the 16:9 frame fills the mask, and ignores
 * pointer events so YouTube's own UI can never surface. Whenever the video
 * isn't actively playing, the track's artwork covers it, hiding YouTube's
 * cue/pause/end screens too.
 */
export default function ScallopedPlayer({ mountRef, track, playing, className = '' }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={`relative aspect-square ${className}`}
      animate={reduceMotion ? undefined : { scale: [1, 1.025], rotate: [-1.5, 1.5] }}
      transition={BREATH}
    >
      {/* Soft cast shadow that follows the mask's outline. */}
      <div aria-hidden className="absolute inset-0 translate-y-3 bg-black/15 blur-2xl" style={{ clipPath: SHAPE_A }} />

      <motion.div
        className="absolute inset-0 overflow-hidden bg-[#111]"
        initial={{ clipPath: SHAPE_A }}
        animate={reduceMotion ? undefined : { clipPath: [SHAPE_A, SHAPE_B] }}
        transition={BREATH}
      >
        {/* Grayscale + contrast keeps the video on-brand. */}
        <div className="absolute inset-0 grayscale contrast-[1.2]">
          {/* YouTube iframe mount point — managed by PlayerProvider. */}
          <div
            ref={mountRef}
            className="pointer-events-none absolute top-1/2 left-1/2 aspect-video h-[135%] -translate-x-1/2 -translate-y-1/2 [&_iframe]:h-full [&_iframe]:w-full"
          />

          {/* Artwork veil: shown whenever the video isn't playing. */}
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-[#111]"
            initial={false}
            animate={{ opacity: playing ? 0 : 1 }}
            transition={{ duration: playing ? 0.9 : 0.3 }}
          >
            {track ? (
              <img
                src={thumbUrl(track.id)}
                alt=""
                className="h-full w-full scale-[1.35] object-cover opacity-80"
                draggable={false}
              />
            ) : (
              <div className="grid h-full place-items-center">
                <span className="text-[56px] font-black tracking-tight text-white/10">MONO</span>
              </div>
            )}
          </motion.div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_45%,rgba(0,0,0,0.45)_100%)]"
        />
      </motion.div>
    </motion.div>
  )
}
