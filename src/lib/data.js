/**
 * Demo content. Swap in your own catalogue here.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * ▶ YOUTUBE VIDEO IDS — DROP YOURS IN HERE
 *
 * `videoId` is the part after `v=` in a YouTube URL:
 *   https://www.youtube.com/watch?v=XXXXXXXXXXX  →  'XXXXXXXXXXX'
 *
 * The IDs below are Creative-Commons Blender open movies, used only so the
 * player has something to render. Replace them with your tracks.
 * ────────────────────────────────────────────────────────────────────────── */
export const TRACKS = [
  {
    id: 'clash-of-titans',
    title: 'Clash of Titans',
    artist: 'Noir Atelier',
    videoId: 'aqz-KE-bpKQ', // ← YOUR VIDEO ID
  },
  {
    id: 'silver-hour',
    title: 'Silver Hour',
    artist: 'Mara Vale',
    videoId: 'eRsGyueVLvQ', // ← YOUR VIDEO ID
  },
  {
    id: 'grain',
    title: 'Grain',
    artist: 'Atlas Mono',
    videoId: 'R6MlUcmOul8', // ← YOUR VIDEO ID
  },
]

/**
 * Time-coded lyric lines (seconds). Original placeholder text — replace with
 * properly licensed lyrics for your tracks.
 */
export const LYRICS = {
  'clash-of-titans': [
    { at: 0, text: 'Static on the skyline, quiet in the room' },
    { at: 8, text: 'Two shadows on the concrete moving into bloom' },
    { at: 16, text: 'We were never made of colour, only light and grain' },
    { at: 24, text: 'Every silent frame of you is playing back again' },
    { at: 32, text: 'Clash of titans, softly now' },
    { at: 40, text: 'Hold the echo, don’t look down' },
    { at: 48, text: 'Black and white is all we need' },
    { at: 56, text: 'Every heartbeat in between' },
  ],
}

const portrait = (seed, size = 600) => `https://picsum.photos/seed/${seed}/${size}/${size}?grayscale`

export const ONBOARDING_BLOBS = [
  { seed: 'mono-artist-1', name: 'Mara Vale' },
  { seed: 'mono-artist-2', name: 'Noir Atelier' },
  { seed: 'mono-artist-3', name: 'Atlas Mono' },
].map((a) => ({ ...a, src: portrait(a.seed) }))

/** `size` drives the staggered grid: 'lg' avatars span two columns/rows. */
export const ARTISTS = [
  { id: 'noir', name: 'Noir Atelier', size: 'lg' },
  { id: 'mara', name: 'Mara Vale', size: 'sm' },
  { id: 'atlas', name: 'Atlas Mono', size: 'sm' },
  { id: 'echo', name: 'Echo Ward', size: 'sm' },
  { id: 'lune', name: 'Lune', size: 'sm' },
  { id: 'ives', name: 'Ives Kahl', size: 'lg' },
  { id: 'sora', name: 'Sora Field', size: 'sm' },
  { id: 'onyx', name: 'Onyx', size: 'sm' },
  { id: 'hale', name: 'Hale & Wren', size: 'sm' },
  { id: 'vera', name: 'Vera Lux', size: 'sm' },
  { id: 'kilo', name: 'Kilo North', size: 'lg' },
  { id: 'faye', name: 'Faye Ono', size: 'sm' },
  { id: 'ruin', name: 'Ruin Club', size: 'sm' },
].map((a) => ({ ...a, src: portrait(`mono-${a.id}`, a.size === 'lg' ? 600 : 300) }))
