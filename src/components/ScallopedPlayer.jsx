import { motion, useReducedMotion } from 'framer-motion'
import { scallopPolygon } from '../lib/shapes'

// Two scallop outlines, offset by half a petal. Morphing between them makes
// the edge ripple slowly, like a flower breathing.
const SHAPE_A = scallopPolygon({ petals: 12, depth: 0.035, phase: 0 })
const SHAPE_B = scallopPolygon({ petals: 12, depth: 0.045, phase: Math.PI / 12 })

const BREATH = { duration: 7, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }

/**
 * The centrepiece: a scalloped, monochrome window onto the YouTube player.
 *
 * `mountRef` is where the YouTube IFrame API injects its <iframe> (see
 * useYouTubePlayer). The iframe is oversized and centred so the 16:9 frame
 * fills the circle-ish mask edge to edge, and it ignores pointer events so
 * none of YouTube's own UI can ever surface.
 */
export default function ScallopedPlayer({ mountRef, playing, size = 300 }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={reduceMotion ? undefined : { scale: [1, 1.025], rotate: [-1.5, 1.5] }}
      transition={BREATH}
    >
      {/* Soft cast shadow that follows the mask's outline. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 translate-y-3 bg-black/15 blur-2xl"
        style={{ clipPath: SHAPE_A }}
      />

      <motion.div
        className="absolute inset-0 overflow-hidden bg-[#111]"
        initial={{ clipPath: SHAPE_A }}
        animate={reduceMotion ? undefined : { clipPath: [SHAPE_A, SHAPE_B] }}
        transition={BREATH}
      >
        {/* CRITICAL: grayscale + contrast keeps the video on-brand. */}
        <div className="absolute inset-0 grayscale-[100%] contrast-[1.2]">
          {/* ────────────────────────────────────────────────────────────
           * ▶ YOUTUBE IFRAME MOUNT POINT
           * The YouTube <iframe> is injected here by useYouTubePlayer.
           * Set the video ID in src/lib/data.js (TRACKS[].videoId).
           * ──────────────────────────────────────────────────────────── */}
          <div
            ref={mountRef}
            className="pointer-events-none absolute top-1/2 left-1/2 aspect-video h-[135%] -translate-x-1/2 -translate-y-1/2 [&>iframe]:h-full [&>iframe]:w-full"
          />
        </div>

        {/* Paper grain + vignette, purely decorative. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_45%,rgba(0,0,0,0.45)_100%)]"
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[#111]"
          animate={{ opacity: playing ? 0 : 0.25 }}
          transition={{ duration: 0.8 }}
        />
      </motion.div>
    </motion.div>
  )
}
