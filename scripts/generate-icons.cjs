// Renders the app and tray icons from inline SVG using Electron's Chromium.
// Usage: npm run icons
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const IDLE_COLOR = '#2563eb'
const ACTIVE_COLOR = '#16a34a'

function appIconSvg(size) {
  // Hand points to about two o'clock.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#bg)"/>
  <rect x="222" y="74" width="68" height="40" rx="12" fill="#fff"/>
  <rect x="243" y="104" width="26" height="30" fill="#fff"/>
  <rect x="356" y="128" width="40" height="30" rx="8" fill="#fff" transform="rotate(45 376 143)"/>
  <circle cx="256" cy="290" r="146" fill="none" stroke="#fff" stroke-width="36"/>
  <path d="M256 290 L256 196" stroke="#fff" stroke-width="30" stroke-linecap="round"/>
  <path d="M256 290 L318 326" stroke="#fff" stroke-width="30" stroke-linecap="round" opacity="0.85"/>
  <circle cx="256" cy="290" r="22" fill="#fff"/>
</svg>`
}

function trayIconSvg(size, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect x="12.5" y="0.5" width="7" height="4" rx="1.2" fill="${color}"/>
  <circle cx="16" cy="18" r="13.5" fill="${color}"/>
  <path d="M16 18 L16 10" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M16 18 L21.5 21" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
</svg>`
}

async function render(svg, size) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-icon-'))
  const page = path.join(tempDir, 'icon.html')
  fs.writeFileSync(page, html)
  try {
    await win.loadFile(page)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  await new Promise((resolve) => setTimeout(resolve, 150))
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  win.destroy()
  const actual = image.getSize()
  if (actual.width !== size || actual.height !== size) {
    image = image.resize({ width: size, height: size, quality: 'best' })
  }
  return image.toPNG()
}

/** Packs PNG images into a .ico file (Windows Vista+ supports PNG-compressed entries). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

function write(relativePath, data) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, data)
  console.log(`wrote ${relativePath} (${data.length} bytes)`)
}

app.disableHardwareAcceleration()
// Each render closes its window; keep the app alive between renders.
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  try {
    write('resources/icon.png', await render(appIconSvg(256), 256))
    write('build/icon.png', await render(appIconSvg(512), 512))

    const icoSizes = [16, 24, 32, 48, 64, 128, 256]
    const icoImages = []
    for (const size of icoSizes) icoImages.push({ size, png: await render(appIconSvg(size), size) })
    write('build/icon.ico', buildIco(icoImages))

    for (const size of [16, 32]) {
      write(`resources/tray-idle-${size}.png`, await render(trayIconSvg(size, IDLE_COLOR), size))
      write(`resources/tray-active-${size}.png`, await render(trayIconSvg(size, ACTIVE_COLOR), size))
    }
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
