// Global type declarations for the electron contextBridge API

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
  soundIds: string[]  // references SoundEntry.id
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

export interface AudioDeviceInfo {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
}

declare global {
  interface Window {
    electronAPI: {
      // Sounds CRUD
      getSounds: () => Promise<SoundEntry[]>
      saveSounds: (sounds: SoundEntry[]) => Promise<void>
      getGroups: () => Promise<SoundGroup[]>
      saveGroups: (groups: SoundGroup[]) => Promise<void>
      openFileDialog: () => Promise<string[]>
      onPlaySound: (cb: (id: string) => void) => () => void

      // VB-Cable management
      checkVBCable: () => Promise<VBCableStatus>
      installVBCable: () => Promise<{ success: boolean; error?: string }>
      detectConflicts: () => Promise<ConflictInfo>
      openSoundSettings: () => Promise<void>
      getVBCableFlag: () => Promise<boolean>
      setVBCableFlag: (checked: boolean) => Promise<void>

      // Tray
      updateTrayStatus: (isPlaying: boolean) => void
      onStopAllSounds: (cb: () => void) => () => void

      // MyInstants
      searchMyInstants: (query: string) => Promise<MyInstantResult[]>
      downloadMyInstantSound: (mp3Url: string, name: string) => Promise<string>

      // Window controls
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
    }
  }
}
