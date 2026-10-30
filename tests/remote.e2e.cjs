// Two real browsers (a TV and a phone) signed in to the same account against
// the Firebase emulators. Checks that what you tap on the phone happens on the TV,
// including when the two devices' clocks disagree.
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE || 'http://localhost:4180/'
const FAKE_YT = fs.readFileSync(path.join(__dirname, 'fake-youtube.js'), 'utf8')
const USER = 'user-' + Date.now()
const SKEW_MIN = Number(process.env.SKEW_MIN || 0)
const T = (id, title) => ({ id: (id + 'xxxxxxxxxxx').slice(0, 11), title, artist: 'Test Artist', duration: 200 })
const TRACKS = [T('alpha', 'Alpha Song'), T('bravo', 'Bravo Song'), T('charlie', 'Charlie Song'), T('delta', 'Delta Song')]
const LIB = { profile: { onboarded: true, name: 'T', artists: [] }, playlists: [{ id: 'pl1', name: 'Mix', tracks: TRACKS, createdAt: 1 }] }

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) failures++
}
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

;(async () => {
  const browser = await chromium.launch()
  const errors = []
  async function device(name, opts, skewMs) {
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    await page.addInitScript(
      ({ lib, skewMs, name }) => {
        if (skewMs) {
          const real = Date.now
          Date.now = () => real() + skewMs
        }
        if (!localStorage.getItem('mono:v1:library')) {
          localStorage.setItem('mono:v1:library', JSON.stringify(lib))
          localStorage.setItem('mono:device-name', name)
        }
      },
      { lib: LIB, skewMs, name },
    )
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
    if (process.env.DEBUG) page.on('console', (m) => console.log(`  [${name}] ${m.type()}: ${m.text().slice(0, 300)}`))
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url())
      if (['localhost', '127.0.0.1'].includes(u.hostname)) return route.continue()
      if (u.href.includes('youtube.com/iframe_api')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_YT })
      return route.fulfill({ status: 404, body: '' })
    })
    await page.goto(BASE + '#/playlist/pl1')
    await page.waitForFunction(() => window.__testSignIn)
    await page.evaluate((user) => window.__testSignIn(user), USER)
    return page
  }

  const tv = await device('Living Room TV', { viewport: { width: 1280, height: 720 } }, SKEW_MIN * 60_000)
  const phone = await device('Phone', { ...devices['iPhone 13'] }, 0)
  const tvVideo = () => tv.evaluate(() => window.__yt?.id)
  const tvState = () => tv.evaluate(() => window.__yt?.state)

  await tv.getByRole('button', { name: 'Play', exact: true }).first().click()
  check(await until(async () => (await tvState()) === 1), 'TV starts playing')
  if (process.env.DEBUG) console.log(await tv.evaluate(() => JSON.stringify({ id: window.__yt?.id, state: window.__yt?.state, log: window.__yt?.log, ls: localStorage.getItem("mono:v1:player"), body: document.body.innerText.slice(-500) })))

  const strip = phone.getByText(/Playing on Living Room TV/i).first()
  check(await until(() => strip.isVisible(), 10000), 'phone shows "Playing on Living Room TV"')
  check(await until(async () => (await phone.locator('text=Alpha Song').count()) > 1), 'phone shows the TV’s song in its player bar')

  await phone.getByRole('button', { name: 'Pause' }).first().tap()
  check(await until(async () => (await tvState()) === 2), 'phone Pause → TV pauses')
  if (process.env.DEBUG) console.log(await tv.evaluate(() => JSON.stringify({ log: window.__yt.log, now: Math.round(performance.now()), st: window.__yt.state, muted: window.__yt.muted, t: window.__yt.getCurrentTime(), wait: /please wait/i.test(document.body.innerText) })))

  await phone.getByRole('button', { name: 'Play', exact: true }).first().tap().catch(() => {})
  check(await until(async () => (await tvState()) === 1), 'phone Play → TV plays')

  await phone.getByRole('button', { name: 'Next' }).first().tap()
  check(await until(async () => (await tvVideo()) === TRACKS[1].id), 'phone Next → TV skips')

  await phone.locator('ul button', { hasText: 'Delta Song' }).first().tap()
  check(await until(async () => (await tvVideo()) === TRACKS[3].id), 'tap a song on phone → it plays on the TV')
  check(await until(async () => (await phone.locator('text=Delta Song').count()) > 1), 'phone bar follows the TV')
  check((await phone.evaluate(() => window.__yt?.log?.length || 0)) === 0, 'phone itself stayed silent')

  // The TV vanishes (Wi-Fi drops, browser killed): the phone must say so.
  const cdp = await tv.context().newCDPSession(tv)
  cdp.send('Page.crash').catch(() => {}) // never resolves: the page is gone
  await new Promise((r) => setTimeout(r, 500))
  await phone.locator('ul button', { hasText: 'Bravo Song' }).first().tap()
  check(await until(() => phone.getByText(/Living Room TV isn’t responding/).first().isVisible(), 9000), 'unresponsive TV → phone says so')
  const playHere = phone.getByRole('button', { name: 'Play here' }).first()
  check(await playHere.isVisible().catch(() => false), '…and offers Play here')
  await playHere.tap().catch(() => {})
  check(await until(async () => (await phone.evaluate(() => window.__yt?.id)) === TRACKS[1].id), 'Play here → the song plays on the phone')
  check(await until(async () => (await phone.getByText(/Playing on Living Room TV/).count()) === 0), 'phone stops showing the dead TV')

  check(errors.length === 0, `no page errors ${errors.join(' | ')}`)
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))])
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
  process.exit(failures ? 1 : 0)
})()
