import { app, BrowserWindow, ipcMain, dialog, globalShortcut, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, readFileSync, createWriteStream, mkdirSync, unlinkSync, statSync, copyFileSync } from 'fs'
import { execSync, spawn } from 'child_process'
import https from 'https'
import http from 'http'
import Store from 'electron-store'
import log from 'electron-log'
import { getResourcesPath, getVBCableInstallerPath, isDev } from './pathUtils'
import { initializeUpdater, checkForUpdates } from './updater'

// ── Logging ────────────────────────────────────────────────────────────────────

log.transports.file.level = 'info'
log.transports.console.level = 'debug'
log.initialize({ preload: false })
log.info('[Main] App starting…')

// ── Types ──────────────────────────────────────────────────────────────────────

interface SoundEntry {
  id: string
  name: string
  filePath: string
  hotkey: string | null
}

interface SoundGroup {
  id: string
  name: string
  hotkey: string | null
  soundIds: string[]
}

interface StoreSchema {
  sounds: SoundEntry[]
  groups: SoundGroup[]
  vbcableChecked: boolean
  stopHotkey: string
}

interface VBCableStatus {
  installed: boolean
  cableInputFound: boolean
  cableOutputFound: boolean
}

interface ConflictInfo {
  hasConflict: boolean
  details: string[]
}

const store = new Store<StoreSchema>({
  defaults: { sounds: [], groups: [], vbcableChecked: false, stopHotkey: 'Ctrl+Shift+S' },
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// ── Tray ───────────────────────────────────────────────────────────────────────

function getTrayIcon(): Electron.NativeImage {
  const candidates = [
    join(app.getAppPath(), 'resources', 'icon.ico'),
    join(app.getAppPath(), 'resources', 'honkpad-icon-256.png'),
    join(app.getAppPath(), 'public', 'icon.ico'),
    join(app.getAppPath(), 'public', 'icon.png'),
    join(__dirname, '..', 'resources', 'icon.ico'),
    join(__dirname, '..', 'resources', 'honkpad-icon-256.png'),
    join(__dirname, '..', 'public', 'icon.ico'),
    join(__dirname, '..', 'public', 'icon.png'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      return img.resize({ width: 16, height: 16 })
    }
  }
  // Fallback: programmatic 16×16 violet square
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    buf[i * 4 + 0] = 139  // R
    buf[i * 4 + 1] = 92   // G
    buf[i * 4 + 2] = 246  // B
    buf[i * 4 + 3] = 255  // A
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function showWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Abrir',
      click: showWindow,
    },
    {
      label: 'Parar todos os sons',
      click: () => {
        mainWindow?.webContents.send('stop-all-sounds')
      },
    },
    { type: 'separator' },
    {
      label: 'Verificar atualizações',
      click: () => {
        checkForUpdates()
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
}

function createTray() {
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Honkpad — pronto')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', showWindow)
  log.info('[Tray] System tray icon created')
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Resolve path to bundled resources (works in dev and production) */
function getResourcePath(...segments: string[]): string {
  const basePath = app.isPackaged
    ? join(process.resourcesPath, ...segments)
    : join(app.getAppPath(), ...segments)
  return basePath
}

/** Run a PowerShell command and return stdout */
function runPowerShell(command: string): string {
  try {
    const result = execSync(
      `powershell.exe -NoProfile -NonInteractive -Command "${command.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 15000, windowsHide: true },
    )
    return result.trim()
  } catch (err) {
    log.warn('[PowerShell] Command failed:', command, err)
    return ''
  }
}

// ── VB-Cable Detection ─────────────────────────────────────────────────────────

function checkVBCableInstalled(): VBCableStatus {
  log.info('[VBCable] Checking installation…')

  const result: VBCableStatus = {
    installed: false,
    cableInputFound: false,
    cableOutputFound: false,
  }

  // Primary approach: Get-PnpDevice (most reliable for virtual audio)
  const pnpOutput = runPowerShell(
    "Get-PnpDevice -FriendlyName '*VB-Audio*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FriendlyName",
  )

  if (pnpOutput) {
    log.info('[VBCable] PnpDevice found:', pnpOutput)
    const lines = pnpOutput.toLowerCase()
    result.installed = true
    result.cableInputFound = lines.includes('cable input') || lines.includes('vb-audio')
    result.cableOutputFound = lines.includes('cable output') || lines.includes('vb-audio')
  } else {
    log.info('[VBCable] No PnpDevice matching VB-Audio found')
  }

  log.info('[VBCable] Status:', JSON.stringify(result))
  return result
}

// ── VB-Cable Download ──────────────────────────────────────────────────────────

async function getVBCableDownloadUrl(): Promise<{ success: boolean; url?: string; error?: string }> {
  return new Promise((resolve) => {
    https.get('https://vb-audio.com/Cable/', (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        try {
          const html = Buffer.concat(chunks).toString('utf-8')
          // Look for the download link pattern: href="https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack*.zip"
          const match = html.match(/href="(https:\/\/download\.vb-audio\.com\/Download_CABLE\/VBCABLE_Driver_Pack\d+\.zip)"/i)
          if (match && match[1]) {
            log.info('[VBCable] Found download URL:', match[1])
            resolve({ success: true, url: match[1] })
          } else {
            log.error('[VBCable] Could not find download link in page')
            resolve({ success: false, error: 'Could not find download link on VB-Cable website' })
          }
        } catch (err) {
          log.error('[VBCable] Error parsing page:', err)
          resolve({ success: false, error: `Error parsing download page: ${err}` })
        }
      })
    }).on('error', (err) => {
      log.error('[VBCable] Failed to fetch download page:', err)
      resolve({ success: false, error: `Failed to fetch VB-Cable download page: ${err.message}` })
    })
  })
}

async function downloadVBCableInstaller(installerPath: string): Promise<{ success: boolean; error?: string }> {
  return new Promise(async (resolve) => {
    // Get the download URL dynamically from the website
    const urlResult = await getVBCableDownloadUrl()
    if (!urlResult.success || !urlResult.url) {
      log.error('[VBCable] Failed to get download URL:', urlResult.error)
      resolve({ success: false, error: urlResult.error })
      return
    }

    const downloadUrl = urlResult.url
    log.info('[VBCable] Downloading from:', downloadUrl)

    // Ensure directory exists
    const installerDir = installerPath.substring(0, installerPath.lastIndexOf('\\'))
    mkdirSync(installerDir, { recursive: true })

    const zipPath = installerPath.replace('.exe', '.zip')
    const file = createWriteStream(zipPath)

    https.get(downloadUrl, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        log.info('[VBCable] Redirected to:', redirectUrl)
        return https.get(redirectUrl, (redirectResponse) => {
          if (redirectResponse.statusCode !== 200) {
            log.error('[VBCable] Redirect returned status:', redirectResponse.statusCode)
            file.destroy()
            resolve({ success: false, error: `Download failed with status: ${redirectResponse.statusCode}` })
            return
          }
          redirectResponse.pipe(file)
        })
      }

      if (response.statusCode !== 200) {
        log.error('[VBCable] Download returned status:', response.statusCode)
        file.destroy()
        resolve({ success: false, error: `Download failed with HTTP status: ${response.statusCode}` })
        return
      }

      response.pipe(file)

      file.on('finish', () => {
        file.close()
        log.info('[VBCable] Download completed, extracting...')

        // Extract zip using PowerShell (built-in, no external deps)
        const extractCmd = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${installerDir.replace(/'/g, "''")}' -Force`
        try {
          execSync(`powershell.exe -NoProfile -NonInteractive -Command "${extractCmd.replace(/"/g, '\\"')}"`, {
            windowsHide: true,
          })
          log.info('[VBCable] Extraction completed')

          // Find the actual exe file (may be in a subdirectory)
          // VB-Cable pack contains setup executables with various names: VBCABLE_Setup.exe, VBCABLE_Setup_x64.exe, VBCable_PackSetup.exe, etc.
          let foundExePath = ''
          const searchForExe = (dir: string, maxDepth = 5, depth = 0): string => {
            if (depth > maxDepth) return ''
            try {
              const files = readdirSync(dir)
              // First pass: look for any exe containing "setup" or starting with "vbcable"
              for (const file of files) {
                if (file.endsWith('.exe')) {
                  const lowerFile = file.toLowerCase()
                  // Prioritize files that contain 'setup' in their name
                  if (lowerFile.includes('setup')) {
                    const filePath = join(dir, file)
                    log.info('[VBCable] Found setup exe:', filePath)
                    return filePath
                  }
                }
              }
              // Second pass: recursively search subdirectories
              for (const file of files) {
                const filePath = join(dir, file)
                const stat = statSync(filePath)
                if (stat.isDirectory()) {
                  const result = searchForExe(filePath, maxDepth, depth + 1)
                  if (result) return result
                }
              }
            } catch (e) {
              log.warn('[VBCable] Error searching directory:', e)
            }
            return ''
          }

          foundExePath = searchForExe(installerDir)

          if (foundExePath) {
            log.info('[VBCable] Found exe at:', foundExePath)
            if (foundExePath !== installerPath) {
              log.info('[VBCable] Copying to expected location:', installerPath)
              try {
                copyFileSync(foundExePath, installerPath)
                log.info('[VBCable] Successfully copied exe to:', installerPath)
              } catch (copyErr) {
                log.error('[VBCable] Failed to copy exe:', copyErr)
                resolve({ success: false, error: `Failed to copy installer: ${copyErr}` })
                return
              }
            } else {
              log.info('[VBCable] Exe already at expected location')
            }
          } else {
            log.error('[VBCable] Extraction completed but exe not found in any subdirectory')
            // List what was actually extracted
            try {
              const extractedFiles = readdirSync(installerDir)
              log.error('[VBCable] Files in extraction directory:', extractedFiles.join(', '))
            } catch (e) {
              log.error('[VBCable] Could not list extraction directory:', e)
            }
            resolve({ success: false, error: 'VB-Cable setup executable not found in extracted files' })
            return
          }

          // Delete zip file
          try {
            unlinkSync(zipPath)
          } catch (e) {
            log.warn('[VBCable] Could not delete temp zip:', e)
          }

          // Final verification
          if (!existsSync(installerPath)) {
            log.error('[VBCable] Exe file does not exist at final location:', installerPath)
            resolve({ success: false, error: `Installer not found at: ${installerPath}` })
            return
          }

          log.info('[VBCable] Download and extraction successful')
          resolve({ success: true })
        } catch (err) {
          log.error('[VBCable] Extraction failed:', err)
          resolve({ success: false, error: `Extraction failed: ${err}` })
        }
      })
    }).on('error', (err) => {
      log.error('[VBCable] Download failed:', err)
      file.destroy()
      resolve({ success: false, error: `Download failed: ${err.message}` })
    })
  })
}

// ── VB-Cable Installation ───────────────────────────────────────────────────────

async function installVBCable(): Promise<{ success: boolean; error?: string }> {
  const installerPath = getResourcePath('resources', 'vbcable', 'VBCABLE_Setup_x64.exe')
  log.info('[VBCable] Installer path:', installerPath)

  // If installer doesn't exist, download it first
  if (!existsSync(installerPath)) {
    log.info('[VBCable] Installer not found at:', installerPath)
    log.info('[VBCable] Downloading VB-Cable...')
    const downloadResult = await downloadVBCableInstaller(installerPath)
    if (!downloadResult.success) {
      const errorMsg = `Failed to download VB-Cable: ${downloadResult.error}`
      log.error('[VBCable]', errorMsg)
      return { success: false, error: errorMsg }
    }
  }

  // Verify the exe exists before trying to run it
  if (!existsSync(installerPath)) {
    const errorMsg = `Installer file not found at: ${installerPath} (after download/extraction)`
    log.error('[VBCable]', errorMsg)
    return { success: false, error: errorMsg }
  }

  return new Promise((resolve) => {
    // Use PowerShell Start-Process with -Verb RunAs to trigger UAC elevation
    const psCommand = `Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -Verb RunAs -Wait`
    log.info('[VBCable] Running elevated install…')

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCommand],
      { windowsHide: true },
    )

    let stderr = ''
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        log.info('[VBCable] Install completed successfully (exit code 0)')
        resolve({ success: true })
      } else {
        const msg = `Installer exited with code ${code}. ${stderr}`.trim()
        log.error('[VBCable] Install failed:', msg)
        resolve({ success: false, error: msg })
      }
    })

    child.on('error', (err) => {
      const msg = `Failed to launch installer: ${err.message}`
      log.error('[VBCable]', msg)
      resolve({ success: false, error: msg })
    })
  })
}

// ── Conflict Detection ──────────────────────────────────────────────────────────

function detectConflicts(): ConflictInfo {
  log.info('[Conflict] Scanning for audio routing conflicts…')
  const details: string[] = []

  // 1. Check if CABLE Output is the default communication recording device
  //    We query the registry for the default communication capture endpoint.
  try {
    const regOutput = runPowerShell(
      "Get-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Multimedia\\Sound Mapper' -Name 'Record' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Record",
    )
    if (regOutput && regOutput.toLowerCase().includes('cable')) {
      details.push('CABLE Output está definido como dispositivo de gravação padrão do Windows.')
      log.info('[Conflict] CABLE Output is default recording device')
    }
  } catch {
    log.warn('[Conflict] Could not read default recording device from registry')
  }

  // 2. Check OBS scene collection files for CABLE Output usage
  try {
    const obsPath = join(
      process.env.APPDATA || '',
      'obs-studio',
      'basic',
      'scenes',
    )
    if (existsSync(obsPath)) {
      const files = readdirSync(obsPath).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        try {
          const content = readFileSync(join(obsPath, file), 'utf-8')
          if (content.toLowerCase().includes('cable output')) {
            details.push(
              `OBS está usando "CABLE Output" como fonte de áudio (cena: ${file.replace('.json', '')}).`,
            )
            log.info('[Conflict] OBS scene using CABLE Output:', file)
          }
        } catch {
          // skip unreadable file
        }
      }
    }
  } catch {
    log.warn('[Conflict] Could not scan OBS scene files')
  }

  const result: ConflictInfo = {
    hasConflict: details.length > 0,
    details,
  }
  log.info('[Conflict] Result:', JSON.stringify(result))
  return result
}

// ── Hotkey Registration ─────────────────────────────────────────────────────────

function registerAllHotkeys() {
  globalShortcut.unregisterAll()

  // Stop-all-sounds global hotkey
  const stopHotkey = store.get('stopHotkey')
  if (stopHotkey) {
    try {
      globalShortcut.register(stopHotkey, () => {
        mainWindow?.webContents.send('stop-all-sounds')
        log.info('[Hotkey] Stop all sounds triggered:', stopHotkey)
      })
    } catch { /* ignore invalid accelerator */ }
  }

  const sounds: SoundEntry[] = store.get('sounds')
  const groups: SoundGroup[] = store.get('groups')

  // Individual sound hotkeys
  for (const sound of sounds) {
    if (sound.hotkey) {
      try {
        globalShortcut.register(sound.hotkey, () => {
          mainWindow?.webContents.send('play-sound', sound.id)
        })
      } catch { /* ignore invalid accelerators */ }
    }
  }

  // Group hotkeys — pick a random sound from the group
  for (const group of groups) {
    if (group.hotkey && group.soundIds.length > 0) {
      try {
        globalShortcut.register(group.hotkey, () => {
          // Resolve soundIds to actual sounds
          const groupSounds = sounds.filter((s) => group.soundIds.includes(s.id))
          if (groupSounds.length === 0) return
          const random = groupSounds[Math.floor(Math.random() * groupSounds.length)]
          mainWindow?.webContents.send('play-sound', random.id)
        })
      } catch { /* ignore invalid accelerators */ }
    }
  }
}

// ── Window Creation ─────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'Honkpad',
    backgroundColor: '#0d0d0f',
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  // Intercept close → minimize to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      log.info('[Tray] Window hidden to tray')
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Initialize auto-updater
  initializeUpdater(mainWindow)
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Sounds CRUD
ipcMain.handle('get-sounds', () => store.get('sounds'))
ipcMain.handle('save-sounds', (_, sounds: SoundEntry[]) => {
  store.set('sounds', sounds)
  registerAllHotkeys()
})

// Groups CRUD
ipcMain.handle('get-groups', () => store.get('groups'))
ipcMain.handle('save-groups', (_, groups: SoundGroup[]) => {
  store.set('groups', groups)
  registerAllHotkeys()
})

// File dialog
ipcMain.handle('open-file-dialog', async () => {
  // show window first so the dialog has a proper parent
  showWindow()
  const result = await dialog.showOpenDialog({
    title: 'Selecionar arquivos de áudio',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Áudio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] },
    ],
  })
  return result.filePaths
})

// ── VB-Cable IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle('check-vbcable', (): VBCableStatus => {
  if (process.env.SKIP_VBCABLE_CHECK === 'true') {
    log.info('[VBCable] SKIP_VBCABLE_CHECK is set, returning installed=true')
    return { installed: true, cableInputFound: true, cableOutputFound: true }
  }
  return checkVBCableInstalled()
})

ipcMain.handle('install-vbcable', async (): Promise<{ success: boolean; error?: string }> => {
  return installVBCable()
})

ipcMain.handle('detect-conflicts', (): ConflictInfo => {
  return detectConflicts()
})

ipcMain.handle('open-sound-settings', () => {
  log.info('[Settings] Opening Windows Sound settings (Recording tab)')
  spawn('rundll32.exe', ['shell32.dll,Control_RunDLL', 'mmsys.cpl,,1'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
})

ipcMain.handle('get-vbcable-flag', (): boolean => {
  return store.get('vbcableChecked')
})

ipcMain.handle('set-vbcable-flag', (_, checked: boolean) => {
  store.set('vbcableChecked', checked)
  log.info('[VBCable] Flag set to:', checked)
})

// ── Stop Hotkey Settings ───────────────────────────────────────────────────────

ipcMain.handle('get-stop-hotkey', () => store.get('stopHotkey'))
ipcMain.handle('set-stop-hotkey', (_, hotkey: string) => {
  store.set('stopHotkey', hotkey)
  log.info('[Settings] Stop hotkey updated:', hotkey)
  registerAllHotkeys()
})

// ── MyInstants Integration ─────────────────────────────────────────────────────

interface MyInstantResult {
  name: string
  mp3Url: string
  slug: string
}

function httpGetHtml(url: string, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) { reject(new Error('Too many redirects')); return }
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const loc = res.headers.location
        httpGetHtml(loc.startsWith('http') ? loc : `https://www.myinstants.com${loc}`, redirectCount + 1)
          .then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

ipcMain.handle('search-myinstants', async (_, query: string): Promise<MyInstantResult[]> => {
  const url = `https://www.myinstants.com/en/search/?name=${encodeURIComponent(query)}`
  log.info('[MyInstants] Searching:', url)

  const html = await httpGetHtml(url)

  // Extract slugs + names from instant-link anchors
  const slugNameRegex = /href="\/en\/instant\/([^"]+)\/"\s+class="instant-link[^"]*">([^<]+)<\/a>/g
  // Extract MP3 URLs from small-button onclick attributes
  const mp3Regex = /class="small-button"[^>]+onclick="play\('([^']+\.mp3)'/g

  const slugNames: Array<{ slug: string; name: string }> = []
  const mp3Urls: string[] = []

  let m: RegExpExecArray | null
  while ((m = slugNameRegex.exec(html)) !== null) {
    slugNames.push({ slug: m[1], name: m[2].trim() })
  }
  while ((m = mp3Regex.exec(html)) !== null) {
    mp3Urls.push(m[1])
  }

  const results: MyInstantResult[] = slugNames
    .map((sn, i) => ({ name: sn.name, mp3Url: mp3Urls[i] ?? '', slug: sn.slug }))
    .filter(r => r.mp3Url)
    .slice(0, 30)

  log.info('[MyInstants] Found', results.length, 'results')
  return results
})

ipcMain.handle('download-myinstant-sound', async (_, mp3Url: string, name: string): Promise<string> => {
  const soundsDir = join(app.getPath('userData'), 'downloaded-sounds')
  mkdirSync(soundsDir, { recursive: true })

  const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80) || 'sound'
  let destPath = join(soundsDir, `${safeName}.mp3`)
  let counter = 1
  while (existsSync(destPath)) {
    destPath = join(soundsDir, `${safeName} (${counter}).mp3`)
    counter++
  }

  const fullUrl = mp3Url.startsWith('http') ? mp3Url : `https://www.myinstants.com${mp3Url}`
  log.info('[MyInstants] Downloading:', fullUrl, '→', destPath)

  await new Promise<void>((resolve, reject) => {
    const download = (u: string, redirectCount = 0) => {
      if (redirectCount > 5) { reject(new Error('Too many redirects')); return }
      const mod = u.startsWith('https') ? https : http
      const req = mod.get(u, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' },
      }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          const loc = res.headers.location
          download(loc.startsWith('http') ? loc : `https://www.myinstants.com${loc}`, redirectCount + 1)
          return
        }
        const file = createWriteStream(destPath)
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
        res.on('error', reject)
      })
      req.on('error', reject)
    }
    download(fullUrl)
  })

  log.info('[MyInstants] Saved to:', destPath)
  return destPath
})

// ── Window Controls ────────────────────────────────────────────────────────────

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.hide())

// ── Tray IPC ───────────────────────────────────────────────────────────────────

ipcMain.on('tray-update-status', (_, isPlaying: boolean) => {
  tray?.setToolTip(isPlaying ? 'Honkpad — 1 som tocando' : 'Honkpad — pronto')
})

// ── App Lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  log.info('[Main] App ready')
  createWindow()
  createTray()
  registerAllHotkeys()
})

// Window is hidden to tray, not closed — prevent default quit behaviour
app.on('window-all-closed', () => {
  // Do nothing: tray keeps the app alive
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else showWindow()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  tray?.destroy()
  tray = null
})
