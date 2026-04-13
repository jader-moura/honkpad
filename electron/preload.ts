import { contextBridge, ipcRenderer } from 'electron'

// ── Types (duplicated from src/types/global.d.ts — preload cannot import from src/) ───

export interface SoundEntry {
  id: string
  name: string
  filePath: string
  hotkey: string | null
}

export interface SoundGroup {
  id: string
  name: string
  hotkey: string | null
  soundIds: string[]
}

export interface VBCableStatus {
  installed: boolean
  cableInputFound: boolean
  cableOutputFound: boolean
}

export interface ConflictInfo {
  hasConflict: boolean
  details: string[]
}

export interface MyInstantResult {
  name: string
  mp3Url: string
  slug: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Sounds CRUD ──
  getSounds: (): Promise<SoundEntry[]> => ipcRenderer.invoke('get-sounds'),
  saveSounds: (sounds: SoundEntry[]): Promise<void> => ipcRenderer.invoke('save-sounds', sounds),

  // ── Groups CRUD ──
  getGroups: (): Promise<SoundGroup[]> => ipcRenderer.invoke('get-groups'),
  saveGroups: (groups: SoundGroup[]): Promise<void> => ipcRenderer.invoke('save-groups', groups),

  // ── File dialog ──
  openFileDialog: (): Promise<string[]> => ipcRenderer.invoke('open-file-dialog'),

  // ── Play sound event (from main → renderer) ──
  onPlaySound: (cb: (id: string) => void) => {
    const listener = (_: unknown, id: string) => cb(id)
    ipcRenderer.on('play-sound', listener)
    return () => ipcRenderer.removeListener('play-sound', listener)
  },

  // ── VB-Cable management ──
  checkVBCable: (): Promise<VBCableStatus> => ipcRenderer.invoke('check-vbcable'),
  installVBCable: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('install-vbcable'),
  detectConflicts: (): Promise<ConflictInfo> => ipcRenderer.invoke('detect-conflicts'),
  openSoundSettings: (): Promise<void> => ipcRenderer.invoke('open-sound-settings'),
  getVBCableFlag: (): Promise<boolean> => ipcRenderer.invoke('get-vbcable-flag'),
  setVBCableFlag: (checked: boolean): Promise<void> => ipcRenderer.invoke('set-vbcable-flag', checked),

  // ── Stop hotkey settings ──
  getStopHotkey: (): Promise<string> => ipcRenderer.invoke('get-stop-hotkey'),
  setStopHotkey: (hotkey: string): Promise<void> => ipcRenderer.invoke('set-stop-hotkey', hotkey),

  // ── Tray ──
  updateTrayStatus: (isPlaying: boolean): void => ipcRenderer.send('tray-update-status', isPlaying),
  onStopAllSounds: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('stop-all-sounds', listener)
    return () => ipcRenderer.removeListener('stop-all-sounds', listener)
  },

  // ── MyInstants ──
  searchMyInstants: (query: string): Promise<MyInstantResult[]> => ipcRenderer.invoke('search-myinstants', query),
  downloadMyInstantSound: (mp3Url: string, name: string): Promise<string> => ipcRenderer.invoke('download-myinstant-sound', mp3Url, name),

  // ── Window controls ──
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // ── External links ──
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
})
