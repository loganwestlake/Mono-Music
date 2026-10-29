import { motion } from 'framer-motion'
import { Play, Search } from 'lucide-react'
import Artwork from '../components/Artwork'
import TrackRow from '../components/TrackRow'
import { Eyebrow, PageTitle, PillButton, SectionTitle } from '../components/ui'
import { FEATURED, GENRES } from '../lib/featured'
import { href, navigate } from '../lib/router'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function HomeView() {
  const { profile, recent, liked } = useLibrary()
  const player = usePlayer()

  return (
    <div className="px-5 pt-8 pb-10 md:px-10 md:pt-12">
      <PageTitle eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
        {greeting()}
        {profile.name ? `, ${profile.name}` : ''}.
      </PageTitle>

      <a
        href={href('/search')}
        className="mt-8 flex h-14 items-center gap-3 rounded-full border border-black/10 bg-white px-5 text-[14px] text-neutral-400 transition hover:border-black/30"
      >
        <Search size={18} strokeWidth={1.5} className="text-[#111]" />
        Search songs, artists, or paste a YouTube link
      </a>

      {recent.length > 0 && (
        <Section title="Jump back in" action={<SeeAll to="/recent" />}>
          <Shelf tracks={recent.slice(0, 12)} />
        </Section>
      )}

      {profile.artists.length > 0 && (
        <Section title="Your artists">
          <div className="no-scrollbar -mx-5 flex gap-5 overflow-x-auto px-5 md:-mx-10 md:px-10">
            {profile.artists.map((a) => (
              <a
                key={a.name}
                href={href(`/search?q=${encodeURIComponent(a.name)}`)}
                className="group w-24 shrink-0 text-center md:w-28"
              >
                <Artwork src={a.picture} name={a.name} shape="circle" className="aspect-square w-full transition group-hover:scale-[1.03]" />
                <span className="mt-2 block truncate text-[12px] font-semibold tracking-tight">{a.name}</span>
              </a>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Featured"
        action={
          <PillButton variant="outline" icon={Play} className="h-9 px-4" onClick={() => player.playTracks(FEATURED, 0)}>
            Play all
          </PillButton>
        }
      >
        <ul className="-mx-2 grid gap-x-6 lg:grid-cols-2">
          {FEATURED.map((t, i) => (
            <TrackRow key={t.id} track={t} list={FEATURED} index={i} />
          ))}
        </ul>
      </Section>

      <Section title="Browse moods">
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => navigate(`/search?q=${encodeURIComponent(`${g} music`)}`)}
              className="rounded-full border border-black/10 px-4 py-2 text-[12px] font-semibold tracking-tight transition hover:bg-[#111] hover:text-white"
            >
              {g}
            </button>
          ))}
        </div>
      </Section>

      {liked.length > 0 && (
        <Section title="Liked songs" action={<SeeAll to="/liked" />}>
          <Shelf tracks={liked.slice(0, 12)} />
        </Section>
      )}
    </div>
  )
}

function Section({ title, action, children }) {
  return (
    <section className="mt-12">
      <SectionTitle action={action}>{title}</SectionTitle>
      {children}
    </section>
  )
}

function SeeAll({ to }) {
  return (
    <a href={href(to)} className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]">
      See all
    </a>
  )
}

const SHAPES = ['blob-a', 'blob-b', 'blob-c', 'blob-d']

/** Horizontal row of organic artwork cards. */
function Shelf({ tracks }) {
  const player = usePlayer()
  return (
    <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-2 md:-mx-10 md:px-10">
      {tracks.map((t, i) => (
        <motion.button
          key={t.id}
          type="button"
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => player.playTracks(tracks, i)}
          className="w-36 shrink-0 text-left md:w-44"
        >
          <Artwork track={t} shape={SHAPES[i % SHAPES.length]} className="aspect-square w-full shadow-[0_16px_30px_-18px_rgba(0,0,0,0.5)]" />
          <span className="mt-3 block truncate text-[13px] font-bold tracking-tight">{t.title}</span>
          <Eyebrow className="mt-0.5 truncate">{t.artist}</Eyebrow>
        </motion.button>
      ))}
    </div>
  )
}
