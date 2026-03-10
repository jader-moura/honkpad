// Global type declarations for the electron contextBridge API

export interface SoundEntry {
  id: string
  name: string
  filePath: string
  hotkey: string | null
}

declare global {
  interface Window {
    electronAPI: {
      getSounds: () => Promise<SoundEntry[]>
      saveSounds: (sounds: SoundEntry[]) => Promise<void>
      openFileDialog: () => Promise<string[]>
      onPlaySound: (cb: (id: string) => void) => () => void
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
    }
  }
}
