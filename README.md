# Mono Music

A strictly monochrome, editorial music player that uses YouTube as a hidden engine.

**Live:** https://loganwestlake.github.io/Mono-Music/

## Features

- **Search** songs and artists, or paste any YouTube link to play it
- **Player** that keeps playing while you browse — queue, shuffle, repeat, seek, volume
- **Library** — liked songs, playlists, recently played (saved in your browser)
- **Synced lyrics** from [LRCLIB](https://lrclib.net)
- **Responsive** — phone (tab bar + full-screen player), laptop (sidebar + player bar), desktop (docked player)
- **Keyboard shortcuts** — Space, Shift+←/→, ←/→, ↑/↓, L, /
- Lock-screen / media-key controls, installable as an app

## Search setup

Search works out of the box through free public servers (Piped / Invidious), which can be slow or offline.
For reliable search, a listener can paste their own free **YouTube Data API v3** key into the app's
**Settings** page ([how to get one](https://developers.google.com/youtube/v3/getting-started)).
The key is stored only in that browser — it is never committed or published with the site.
Pasting a YouTube link always works without any key.

## Develop

```bash
npm install
npm run dev
```

## Structure

```
src/
  App.jsx                   routes, responsive shell, keyboard shortcuts
  player/                   YouTube engine + queue, Now Playing, mini player
  store/                    library (localStorage) and toasts
  views/                    Home, Search, Library, Playlist, Settings, onboarding
  components/               scalloped player, track rows, artwork, navigation…
  lib/                      search, lyrics, artists, router, track helpers
```
