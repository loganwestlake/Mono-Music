# Mono Music

A strictly monochrome, editorial music app that uses YouTube as a hidden backend.

React · Tailwind CSS v4 · Framer Motion · Lucide React · Vite

```bash
npm install
npm run dev
```

Live site: https://loganwestlake.github.io/Mono-Music/ (deployed by `.github/workflows/deploy.yml` on every push).

Screens are addressable by hash: `#onboarding`, `#artists`, `#now-playing`.

## Dropping in your YouTube videos

Set `videoId` on each entry of `TRACKS` in `src/lib/data.js` (the part after `v=` in a YouTube URL).
The iframe itself is mounted inside the scalloped mask in `src/components/ScallopedPlayer.jsx`
(look for `YOUTUBE IFRAME MOUNT POINT`) and driven by the IFrame API hook in
`src/lib/useYouTubePlayer.js`, so YouTube's own controls never appear.

## Structure

```
src/
  App.jsx                    screen routing + phone frame on desktop
  screens/NowPlaying.jsx     scalloped player, track info, controls, lyrics
  screens/Onboarding.jsx     floating blob portraits + Sign Up
  screens/ChooseArtists.jsx  staggered avatar grid
  components/ScallopedPlayer.jsx
  components/ui.jsx          IconButton, ScreenHeader, Eyebrow, PillButton
  lib/shapes.js              scallop clip-path generator, blob radii
  lib/useYouTubePlayer.js    YouTube IFrame API hook
  lib/data.js                tracks, lyrics, artists (demo content)
```
