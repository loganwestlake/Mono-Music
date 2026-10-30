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
  instrumental dots, tap-to-seek, adjustable size
- Lyrics are matched to the length of what's actually playing; per-song timing and tap-to-sync

**Accounts & devices**
- Sign in with Google: playlists, likes, history, stats and settings sync across devices
- Devices menu: see what each signed-in device is playing, control it remotely (play/pause, skip,
  seek, volume), move playback to this device or send it to another

**Everything else**
- Editorial monochrome design, dark mode (D), command palette (⌘K), keyboard shortcuts (?),
  installable app that opens offline

## Ad-free server (free Cloudflare Worker) — needed for ad-free playback

Public Piped / Invidious servers refuse requests from other websites (CORS), so a browser can't use
them directly. [`worker/mono-proxy.js`](worker/mono-proxy.js) is a tiny relay you run for free on
Cloudflare: it asks those servers server-side and returns the answer to your site. No keys, no secrets,
read-only endpoints only, answers cached for 10 minutes.

1. Sign up at https://dash.cloudflare.com (free).
2. **Workers & Pages → Create → Create Worker** → keep "Hello World" → **Deploy**.
3. **Edit code** → replace everything with `worker/mono-proxy.js` (Mono → Settings → *Copy worker code*) → **Deploy**.
4. Paste the worker address (`https://….workers.dev`) in **Mono → Settings → Ad-free server** → Save.
   It syncs to your other signed-in devices.

## Firebase setup (accounts, sync, devices)

The Firebase web config in `src/lib/firebase.js` is **not a secret** — Firebase web configs are public
identifiers that every visitor's browser receives. What protects your data is the security rules and the
console settings below. One-time steps in the [Firebase console](https://console.firebase.google.com/project/mono-music-c0b63):

1. **Authentication → Sign-in method → Google → Enable.**
2. **Authentication → Settings → Authorized domains → Add** `loganwestlake.github.io`.
3. **Firestore Database → Create database** (production mode).
4. **Firestore → Rules:** paste the contents of [`firestore.rules`](firestore.rules) and **Publish**
   (or run `firebase deploy --only firestore:rules`). Each signed-in user can then read/write only
   `users/{their uid}/…` — nobody else's data.
5. *(Recommended)* [Google Cloud → Credentials](https://console.cloud.google.com/apis/credentials?project=mono-music-c0b63):
   edit the "Browser key", set **Application restrictions → Websites** to
   `https://loganwestlake.github.io/*`, `http://localhost:*/*` and
   `https://mono-music-c0b63.firebaseapp.com/*`.

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
