import { chartArtists } from './deezer'

/** Artist directory for onboarding: the live Deezer chart, or a static list rendered as monograms. */
const FALLBACK = [
  'Taylor Swift', 'The Weeknd', 'Billie Eilish', 'Kendrick Lamar', 'SZA', 'Drake',
  'Dua Lipa', 'Bad Bunny', 'Frank Ocean', 'Radiohead', 'Daft Punk', 'Adele',
  'Beyoncé', 'Tyler, The Creator', 'Lana Del Rey', 'Arctic Monkeys', 'Bruno Mars', 'Olivia Rodrigo',
].map((name) => ({ name, picture: null }))

export function topArtists() {
  return chartArtists(30)
    .then((list) => (list.length >= 6 ? list : FALLBACK))
    .catch(() => FALLBACK)
}
