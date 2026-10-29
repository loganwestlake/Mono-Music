import { forwardRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { scallopPolygon } from '../lib/shapes'
import { artUrl } from '../lib/tracks'

// Two scallop outlines, offset by half a petal. Morphing between them makes
// the edge ripple slowly, like a flower breathing.
const SHAPE_A = scallopPolygon({ petals: 12, depth: 0.035, phase: 0 })
const SHAPE_B = scallopPolygon({ petals: 12, depth: 0.045, phase: Math.PI / 12 })

const BREATH = { duration: 7, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }

/**
 * The centrepiece: a monochrome window onto the player engines.
 *
 *   mode="art"   — scalloped, breathing flower mask; video cropped to fill it.
 *   mode="video" — the full, uncropped 16:9 video in a rounded frame.
 *
 * `mountRef` receives the element the engines (YouTube iframe / <video>)
 * live in. Switching modes only changes CSS — the element never moves, so
 * playback is never interrupted. Whenever there's nothing clean to show
 * (paused YouTube, audio-only stream), the track's artwork covers it.
 */
const ScallopedPlayer = forwardRef(function ScallopedPlayer(
  { mountRef, track, playing, mode = 'art', showVeil, interactive = false, onPointerDown, className = '' },
  ref,
) {
  const reduceMotion = useReducedMotion()
  const video = mode === 'video'
  const breathe = !video && !reduceMotion

  return (
    <motion.div
      ref={ref}
      layout
      onPointerDown={interactive ? undefined : onPointerDown}
      className={`relative ${interactive ? '' : 'touch-none'} ${video ? 'aspect-video' : 'aspect-square'} ${className}`}
      animate={breathe ? { scale: [1, 1.025], rotate: [-1.5, 1.5] } : { scale: 1, rotate: 0 }}
      transition={breathe ? BREATH : { duration: 0.4 }}
    >
      {/* Soft cast shadow that follows the outline. */}
      <div
        aria-hidden
        className={`absolute inset-0 translate-y-3 bg-black/15 blur-2xl ${video ? 'rounded-3xl' : ''}`}
        style={video ? undefined : { clipPath: SHAPE_A }}
      />

      <motion.div
        className={`absolute inset-0 overflow-hidden bg-[#111] ${video ? 'rounded-3xl' : ''}`}
        initial={{ clipPath: video ? 'none' : SHAPE_A }}
        animate={{ clipPath: video ? 'none' : reduceMotion ? SHAPE_A : [SHAPE_A, SHAPE_B] }}
        transition={video ? { duration: 0 } : BREATH}
      >
        {/* Grayscale + contrast keeps the video on-brand. */}
        <div className="absolute inset-0 grayscale contrast-[1.2]">
          {/* Engine mount point — managed by PlayerProvider. */}
          <div
            ref={mountRef}
            className={`${interactive ? 'pointer-events-auto' : 'pointer-events-none'} absolute ${
              video
                ? 'inset-0 [&_video]:object-contain'
                : 'top-1/2 left-1/2 aspect-video h-[135%] -translate-x-1/2 -translate-y-1/2 [&_video]:object-cover'
            }`}
          />

          {/* Artwork veil. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[#111]"
            initial={false}
            animate={{ opacity: showVeil ? 1 : 0 }}
            transition={{ duration: showVeil ? 0.3 : 0.9 }}
          >
            {track ? (
              <img
                src={artUrl(track)}
                alt=""
                className={`h-full w-full object-cover opacity-80 ${video ? '' : 'scale-[1.35]'}`}
                draggable={false}
              />
            ) : (
              <div className="grid h-full place-items-center">
                <span className="text-[56px] font-black tracking-tight text-white/10">MONO</span>
              </div>
            )}
          </motion.div>
        </div>

        {!video && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_45%,rgba(0,0,0,0.45)_100%)]"
          />
        )}
      </motion.div>
    </motion.div>
  )
})

export default ScallopedPlayer
