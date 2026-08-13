// Captures the docs screenshots from the bundled example pack.
//
//   node scripts/screenshot-docs.js
//
// Requires the Playwright Chromium binary: `npx playwright install chromium`
// once, if you haven't already. Boots its own dev server on a scratch port so
// it doesn't collide with one you already have running, drives it with
// Playwright, and writes PNGs to docs/img/.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const PORT = 5183
const APP_URL = `http://localhost:${PORT}`
const outDir = fileURLToPath(new URL('../docs/img', import.meta.url))
mkdirSync(outDir, { recursive: true })

async function waitForServer (url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await sleep(250)
  }
  throw new Error(`dev server did not come up at ${url}`)
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
  cwd: fileURLToPath(new URL('..', import.meta.url))
})

// The app's theme is an explicit localStorage preference (see App.jsx's
// PREFS_KEY), not driven by prefers-color-scheme -- emulateMedia alone
// wouldn't switch it. Seed the pref before the page's own script runs.
async function newLightPage (browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.addInitScript(() => {
    localStorage.setItem('tde.prefs', JSON.stringify({ theme: 'light' }))
  })
  await page.emulateMedia({ colorScheme: 'light' })
  return page
}

try {
  await waitForServer(APP_URL)

  const browser = await chromium.launch()
  const page = await newLightPage(browser)

  // ── Library: select the example pack, generate a dungeon ──
  await page.goto(APP_URL)
  await page.locator('input[placeholder="name this dungeon…"]').fill('Docs Screenshot')
  const packSelect = page.locator('select').first()
  if (await packSelect.count()) await packSelect.selectOption('example')
  await page.getByRole('button', { name: 'Generate' }).click()
  await page.waitForSelector('text=READ ALOUD', { timeout: 10000 })
  await sleep(300) // let the cube's entry animation settle

  await page.screenshot({ path: `${outDir}/room-panel.png` })
  console.log('wrote room-panel.png')

  // ── Pack builder: duplicate the example pack into the editor ──
  const page2 = await newLightPage(browser)
  await page2.goto(APP_URL)
  await page2.getByRole('button', { name: 'Build a pack…' }).click()
  // Tooltips here are a data-tip attribute (CSS-driven), not the native
  // title attribute -- getByTitle won't see them.
  await page2.locator('button[data-tip="duplicate to edit"]').first().click()
  await page2.waitForSelector('text=Pack id (slug)', { timeout: 10000 })
  await sleep(300)

  await page2.screenshot({ path: `${outDir}/pack-builder.png` })
  console.log('wrote pack-builder.png')

  await browser.close()
} finally {
  server.kill()
}
