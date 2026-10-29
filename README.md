# Mono Music

A strictly monochrome, editorial music player that uses YouTube as a hidden engine.

**Live:** https://loganwestlake.github.io/Mono-Music/

## Features

**Listening**
- Ad-free playback through open-source Piped / Invidious servers — live server discovery, health
  ranking, parallel racing, up to 3 retries per song and pre-loading of the next song
- YouTube fallback with ad detection: ads are muted, counted down, and can be skipped after 5 s
  (by switching to an ad-free copy)
- Spotify-style player bar on every screen · docked Now Playing panel on wide screens
- Art / Video views, full screen, pop-out always-on-top mini player (Chrome / Edge)
- Queue with drag-to-reorder, save queue as playlist, autoplay similar music, artist & song radio
- Sleep timer, playback speed, media keys / lock-screen controls, song-change notifications

**Discovery**
- "You might be interested in" — recommendations from what you play, like and follow
- Global Top 50, artist pages (popular songs, similar artists), mood shortcuts, search history

**Library**
- Import playlists from Spotify (sign-in), YouTube playlists, CSV (Exportify etc.) or pasted text
- All playlists in the sidebar / mobile menu · liked songs, history, play counts
- Playlist filter, sort, duplicate, export CSV, undo for deletes · backup & restore
- Your Stats: listening time, streaks, top songs and artists

**Lyrics**
- Full-screen Apple Music–style lyrics: karaoke fill, cascading motion, drifting artwork backdrop,
  instrumental dots, tap-to-seek, adjustable size and timing

**Everything else**
- Editorial monochrome design, dark mode (D), command palette (⌘K), keyboard shortcuts (?),
  installable app that opens offline

## Spotify import setup

Spotify requires each app to be registered (free, ~2 minutes). In **Import → Spotify** the app
walks you through it: create an app at https://developer.spotify.com/dashboard, add the shown
Redirect URI, and paste the Client ID (a public identifier, not a secret). No time? Export a
playlist as CSV at https://exportify.app and use **Import → File / Text**.

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
