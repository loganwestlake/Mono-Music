import { BarChart3, Clock, Download, Heart, Plus } from 'lucide-react'
import Artwork from '../components/Artwork'
import { Eyebrow, PillButton } from '../components/ui'
import { href, navigate } from '../lib/router'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'

export default function LibraryView() {
  const { playlists, liked, recent, createPlaylist } = useLibrary()
  const { setImportOpen } = useUi()

  const newPlaylist = () => {
    const id = createPlaylist(`Playlist ${playlists.length + 1}`)
    navigate(`/playlist/${id}`)
  }

  return (
    <div className="px-5 pt-8 pb-10 md:px-10 md:pt-12">
      <Eyebrow>Your collection</Eyebrow>
      <h1 className="mt-2 text-[52px] leading-[0.88] font-black tracking-[-0.04em] md:text-[88px]">
        Lib<span className="font-serif font-normal italic">rary</span>
      </h1>
      <div className="mt-6 flex flex-wrap gap-2">
        <PillButton icon={Plus} onClick={newPlaylist} className="h-11 px-5">
          New playlist
        </PillButton>
        <PillButton variant="outline" icon={Download} onClick={() => setImportOpen(true)} className="h-11 px-5">
          Import from Spotify & more
        </PillButton>
        <PillButton variant="outline" icon={BarChart3} onClick={() => navigate('/stats')} className="h-11 px-5">
          Your stats
        </PillButton>
      </div>

      <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <Tile to="/liked" title="Liked Songs" meta={`${liked.length} songs`} icon={Heart} />
        <Tile to="/recent" title="Recently Played" meta={`${recent.length} songs`} icon={Clock} />
        {playlists.map((p) => (
          <Tile key={p.id} to={`/playlist/${p.id}`} title={p.name} meta={`${p.tracks.length} songs`} tracks={p.tracks} />
        ))}
      </ul>
    </div>
  )
}

function Tile({ to, title, meta, icon: Icon, tracks = [] }) {
  return (
    <li>
      <a href={href(to)} className="group block">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#111] transition group-hover:-translate-y-1">
          {Icon ? (
            <div className="grid h-full place-items-center text-white">
              <Icon size={40} strokeWidth={1} />
            </div>
          ) : tracks.length >= 4 ? (
            <div className="grid h-full grid-cols-2">
              {tracks.slice(0, 4).map((t) => (
                <Artwork key={t.id} track={t} shape="none" className="h-full w-full" />
              ))}
            </div>
          ) : tracks.length ? (
            <Artwork track={tracks[0]} shape="none" className="h-full w-full" />
          ) : (
            <div className="grid h-full place-items-center text-[44px] font-black tracking-tight text-white/15 uppercase">
              {title.slice(0, 2)}
            </div>
          )}
        </div>
        <p className="mt-3 truncate text-[14px] font-bold tracking-tight">{title}</p>
        <Eyebrow className="mt-0.5">{meta}</Eyebrow>
      </a>
    </li>
  )
}
