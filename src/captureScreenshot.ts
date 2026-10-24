// Takes a README screenshot of one dashboard page: headless Chrome signs in to a running app, opens the page and
// captures the content column (no sidebar or app bar) at 2x, in the dark theme, formatted for en-CA.
//
//   pnpm screenshot <page> <output.png>
//   pnpm screenshot reporting/budgets screenshot3.png
//   pnpm screenshot "reporting/daily?dateRange=month&dateFrom=2026-10-01&dateTo=2026-10-31" screenshot4.png
//
// <page> is relative to /<accountId>/dashboard/ (or an absolute path starting with /). Point it at the demo data
// (see "Quick demo" in the README), not real finances. Talks to Chrome over the DevTools protocol with Node's built-in
// WebSocket, so nothing extra is installed.
//
// Environment (all optional):
//   SCREENSHOT_URL       the running app (default http://localhost:3001)
//   SCREENSHOT_EMAIL     sign-in email (default the demo seed user)
//   SCREENSHOT_PASSWORD  sign-in password (default the demo seed password)
//   SCREENSHOT_WIDTH     window width in CSS pixels (default 1502, which the existing screenshots use)
//   CHROME_PATH          Chrome or Chromium binary (default the macOS Google Chrome app)
import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const BASE_URL = (process.env.SCREENSHOT_URL || 'http://localhost:3001').replace(/\/$/, '')
const EMAIL = process.env.SCREENSHOT_EMAIL || 'admin@somewhere.com'
const PASSWORD = process.env.SCREENSHOT_PASSWORD || 'devpassword123'
const WIDTH = Number(process.env.SCREENSHOT_WIDTH || 1502)
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const LOCALE = 'en-CA'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Clip = { x: number; y: number; width: number; height: number }

/** A minimal Chrome DevTools protocol client for one page. */
class Page {
  private nextId = 0
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()

  private constructor(private socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      const request = message.id ? this.pending.get(message.id) : undefined
      if (!request) return
      this.pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    })
  }

  /**
   * Connects to the Chrome using `profile`. Chrome picks a free debugging port and writes it to DevToolsActivePort in
   * its profile, so this only ever talks to the Chrome this script started, never another one already on a port.
   */
  static async connect(profile: string) {
    const portFile = path.join(profile, 'DevToolsActivePort')
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if (!existsSync(portFile)) throw new Error('not started')
        const port = Number(readFileSync(portFile, 'utf8').split('\n')[0])
        if (!port) throw new Error('not started')
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const target = targets.find((candidate: { type: string }) => candidate.type === 'page')
        if (target) {
          const socket = new WebSocket(target.webSocketDebuggerUrl)
          await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve, { once: true })
            socket.addEventListener('error', reject, { once: true })
          })
          return new Page(socket)
        }
      } catch {
        // Chrome is still starting.
      }
      await sleep(200)
    }
    throw new Error(`Chrome did not start (CHROME_PATH=${CHROME_PATH})`)
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate<T>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    return result.value
  }

  async waitFor(expression: string, what: string, timeoutMs = 30_000) {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      if (await this.evaluate<boolean>(expression)) return
      await sleep(250)
    }
    throw new Error(`Timed out waiting for ${what}`)
  }

  async setViewport(height: number) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height, deviceScaleFactor: 2, mobile: false })
  }

  close() {
    this.socket.close()
  }
}

// Shown on screen: not display:none, visibility:hidden or fully transparent, itself or through an ancestor (a closed
// dialog keeps its contents in the page but hidden).
const IS_SHOWN = `(el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true })`

/** Waits until nothing on the page has been loading (a visible progress indicator) for a while. */
async function waitUntilSettled(page: Page) {
  const loading = `[...document.querySelectorAll('[role=progressbar], .MuiSkeleton-root')].some(${IS_SHOWN})`
  let quietSince = Date.now()
  const end = Date.now() + 30_000
  while (Date.now() < end) {
    if (await page.evaluate<boolean>(loading)) quietSince = Date.now()
    else if (Date.now() - quietSince > 2000) return
    await sleep(250)
  }
  throw new Error('Timed out waiting for the page to finish loading')
}

// The content column below the app bar, down to the last visible content plus a margin. Leaf elements, charts and
// panels give the bottom, so layout margins, full-height containers and closed menus or dialogs don't add space.
const CONTENT_CLIP = `(() => {
  const columns = [...document.querySelectorAll('main')].filter((el) => el.getBoundingClientRect().left > 0)
  const column = columns.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]
  if (!column) throw new Error('No content column (main) found')
  const columnRect = column.getBoundingClientRect()
  const header = document.querySelector('header')
  const top = header ? header.getBoundingClientRect().bottom : columnRect.top
  const shown = ${IS_SHOWN}
  const visible = (el) => {
    const rect = el.getBoundingClientRect()
    return rect.height > 0 && rect.width > 0 && getComputedStyle(el).position !== 'fixed' && shown(el)
  }
  const blocks = [...column.querySelectorAll('*')].filter(
    (el) => el.childElementCount === 0 || el.matches('svg, canvas, table, [role=alert], .MuiPaper-root'),
  )
  const bottom = blocks.filter(visible).reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), top)
  return { x: columnRect.left, y: top, width: columnRect.width, height: bottom + 64 - top }
})()`

async function capture(pagePath: string, output: string) {
  const profile = mkdtempSync(path.join(tmpdir(), 'makecents-screenshot-'))
  const chrome = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--no-first-run',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  let page: Page | undefined
  try {
    page = await Page.connect(profile)
    await page.send('Page.enable')
    await page.setViewport(1100)
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
    // Money is formatted with navigator.language, which follows Accept-Language rather than the locale override.
    await page.send('Emulation.setLocaleOverride', { locale: LOCALE })
    const { userAgent } = await page.send('Browser.getVersion')
    await page.send('Emulation.setUserAgentOverride', { userAgent, acceptLanguage: LOCALE })

    await page.send('Page.navigate', { url: `${BASE_URL}/account/signIn` })
    await page.waitFor(`document.querySelectorAll('input').length >= 2`, 'the sign-in form')
    await waitUntilSettled(page)
    for (const [index, text] of [
      [0, EMAIL],
      [1, PASSWORD],
    ] as const) {
      await page.evaluate(`document.querySelectorAll('input')[${index}].focus()`)
      await page.send('Input.insertText', { text })
    }
    const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...enter })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter })
    await page.waitFor(`/^\\/\\d+\\/dashboard/.test(location.pathname)`, 'sign-in (check the email and password)')

    const accountId = await page.evaluate<string>(`location.pathname.split('/')[1]`)
    const url = pagePath.startsWith('/')
      ? `${BASE_URL}${pagePath}`
      : `${BASE_URL}/${accountId}/dashboard/${pagePath.replace(/^\//, '')}`
    await page.send('Page.navigate', { url })
    await page.waitFor(`document.readyState === 'complete'`, url)
    await waitUntilSettled(page)

    // Make the window as tall as the page so nothing scrolls or sticks, then crop.
    await page.setViewport(await page.evaluate<number>(`document.documentElement.scrollHeight`))
    await waitUntilSettled(page)
    const clip = await page.evaluate<Clip>(CONTENT_CLIP)
    const { data } = await page.send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...clip, scale: 1 },
      captureBeyondViewport: true,
    })
    writeFileSync(output, Buffer.from(data, 'base64'))
    console.log(`Saved ${url} to ${output} (${Math.round(clip.width * 2)}x${Math.round(clip.height * 2)})`)
  } finally {
    page?.close()
    // Chrome keeps writing to its profile until it has exited, so remove the profile after that.
    const exited = new Promise((resolve) => chrome.once('exit', resolve))
    chrome.kill()
    await Promise.race([exited, sleep(5000)])
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      console.warn(`Could not remove the temporary Chrome profile ${profile}`)
    }
  }
}

const [pagePath, output] = process.argv.slice(2)
if (!pagePath || !output) {
  console.error('Usage: pnpm screenshot <page, e.g. reporting/budgets> <output.png>')
  process.exit(1)
}
capture(pagePath, path.resolve(process.env.INIT_CWD || process.cwd(), output)).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
