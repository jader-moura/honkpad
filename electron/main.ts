import { app, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron'
import { join } from 'path'
import Store from 'electron-store'

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
}

const store = new Store<StoreSchema>({ defaults: { sounds: [], groups: [] } })

let mainWindow: BrowserWindow | null = null

function registerAllHotkeys() {
  globalShortcut.unregisterAll()

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
          const groupSounds = sounds.filter(s => group.soundIds.includes(s.id))
          if (groupSounds.length === 0) return
          const random = groupSounds[Math.floor(Math.random() * groupSounds.length)]
          mainWindow?.webContents.send('play-sound', random.id)
        })
      } catch { /* ignore invalid accelerators */ }
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'Soundboard',
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

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-sounds', () => store.get('sounds'))
ipcMain.handle('save-sounds', (_, sounds: SoundEntry[]) => {
  store.set('sounds', sounds)
  registerAllHotkeys()
})

ipcMain.handle('get-groups', () => store.get('groups'))
ipcMain.handle('save-groups', (_, groups: SoundGroup[]) => {
  store.set('groups', groups)
  registerAllHotkeys()
})

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Selecionar arquivos de áudio',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Áudio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] }],
  })
  return result.filePaths
})

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  registerAllHotkeys()
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
