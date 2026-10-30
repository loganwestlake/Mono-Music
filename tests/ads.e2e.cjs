// Without the ad-free server the app falls back to YouTube's player, which can
// show pre-roll ads. Whatever way YouTube reports the ad, none of it may be heard.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE || 'http://localhost:4180/'
const FAKE_YT = fs.readFileSync(path.join(__dirname, 'fake-youtube.js'), 'utf8')
const T = (id, title) => ({ id: (id + 'xxxxxxxxxxx').slice(0, 11), title, artist: 'Test Artist', duration: 200 })
const TRACKS = [T('alpha', 'Alpha Song'), T('bravo', 'Bravo Song')]
const LIB = { profile: { onboarded: true, name: 'T', artists: [] }, playlists: [{ id: 'pl1', name: 'Mix', tracks: TRACKS, createdAt: 1 }] }

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) failures++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch()
  for (const style of ['short', 'zero', 'main']) {
    for (const vp of [{ viewport: { width: 1280, height: 800 } }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
      const label = `${style} ad, ${vp.isMobile ? 'phone' : 'desktop'}`
      const ctx = await browser.newContext(vp)
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.addInitScript(
        ({ lib, style }) => {
          localStorage.setItem('mono:v1:library', JSON.stringify(lib))
          window.__ytAd = 4
          window.__ytAdStyle = style
        },
        { lib: LIB, style },
      )
      await page.route('**/*', (route) => {
        const u = new URL(route.request().url())
        if (['localhost', '127.0.0.1'].includes(u.hostname)) return route.continue()
        if (u.href.includes('youtube.com/iframe_api')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_YT })
        return route.fulfill({ status: 404, body: '' })
      })
      await page.goto(BASE + '#/playlist/pl1')
      await page.getByRole('button', { name: 'Play', exact: true }).first().click()
      await wait(1500)
      const during = await page.evaluate(() => document.body.innerText)
      check(/please wait/i.test(during), `${label}: shows “Please wait” during the ad`)
      if (!vp.isMobile) {
        // Pause must work during “Please wait” too, and resuming stays silent.
        await page.evaluate(() => document.activeElement?.blur())
        await page.keyboard.press('Space')
        await wait(400)
        check((await page.evaluate(() => window.__yt.state)) === 2, `${label}: Pause works during “Please wait”`)
        await page.keyboard.press('Space')
      }
      await wait(4500)
      const r = await page.evaluate(() => ({ heard: window.__adHeard || 0, samples: window.__adSamples || 0, muted: window.__yt.muted, state: window.__yt.state }))
      check(r.samples > 0 && r.heard === 0, `${label}: ad never audible (${r.heard}/${r.samples} samples heard)`)
      check(r.state === 1 && !r.muted, `${label}: song plays with sound after the ad`)
      check(errors.length === 0, `${label}: no page errors ${errors.join(' | ')}`)
      await ctx.close()
    }
  }
  await browser.close()
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
  process.exit(failures ? 1 : 0)
})()
