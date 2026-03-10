import { contextBridge, ipcRenderer } from 'electron'

export interface SoundEntry {
  id: string
  name: string
  filePath: string
  hotkey: string | null
}

contextBridge.exposeInMainWorld('electronAPI', {
  getSounds: (): Promise<SoundEntry[]> => ipcRenderer.invoke('get-sounds'),
  saveSounds: (sounds: SoundEntry[]): Promise<void> => ipcRenderer.invoke('save-sounds', sounds),
  openFileDialog: (): Promise<string[]> => ipcRenderer.invoke('open-file-dialog'),

  onPlaySound: (cb: (id: string) => void) => {
    const listener = (_: unknown, id: string) => cb(id)
    ipcRenderer.on('play-sound', listener)
    return () => ipcRenderer.removeListener('play-sound', listener)
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
})
