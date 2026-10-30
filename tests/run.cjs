// Runs every browser test against a test build (VITE_FIREBASE_EMULATOR=1,
// output in dist-test/). Needs the Firebase emulators running — CI does:
//   firebase emulators:exec --only firestore,auth --project demo-mono "npm test"
const { spawn, spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4180', '--strictPort'], { cwd: root, stdio: 'ignore' })

const runs = [
  ['remote.e2e.cjs', {}],
  ['remote.e2e.cjs', { SKEW_MIN: '4' }], // TV clock ahead
  ['remote.e2e.cjs', { SKEW_MIN: '-90' }], // TV clock way behind
  ['ads.e2e.cjs', {}],
]

;(async () => {
  for (let i = 0; i < 50; i++) {
    const up = await fetch('http://localhost:4180/').then((r) => r.ok, () => false)
    if (up) break
    await new Promise((r) => setTimeout(r, 200))
  }
  let failed = 0
  for (const [file, env] of runs) {
    console.log(`\n▶ ${file} ${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' ')}`)
    const r = spawnSync('node', [path.join(__dirname, file)], { stdio: 'inherit', env: { ...process.env, ...env }, timeout: 180_000 })
    if (r.status !== 0) failed++
  }
  server.kill()
  console.log(failed ? `\n✗ ${failed} test file(s) failed` : '\n✓ all tests passed')
  process.exit(failed ? 1 : 0)
})()
