/**
 * Shape helpers for Mono Music's organic, editorial masks.
 */

/**
 * Builds a CSS `polygon()` that traces a scalloped, flower-like outline.
 * Radius follows r(θ) = base + depth · cos(petals · θ + phase), sampled
 * finely enough that the edge reads as a smooth curve.
 *
 * Every polygon has the same number of points, so Framer Motion can
 * interpolate between two of them (e.g. different `phase` values) for a
 * slow, liquid morph.
 */
export function scallopPolygon({ petals = 12, depth = 0.035, phase = 0, samples = 240 } = {}) {
  const base = 0.5 - depth
  const points = []
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2
    const r = base + depth * Math.cos(petals * t + phase)
    const x = 50 + r * 100 * Math.cos(t)
    const y = 50 + r * 100 * Math.sin(t)
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`)
  }
  return `polygon(${points.join(', ')})`
}

/** Organic, asymmetric border-radius presets ("blobs"). */
export const BLOBS = {
  a: '45% 55% 50% 50% / 50% 45% 55% 50%',
  b: '58% 42% 38% 62% / 42% 55% 45% 58%',
  c: '40% 60% 62% 38% / 55% 38% 62% 45%',
  d: '52% 48% 44% 56% / 60% 52% 48% 40%',
}
