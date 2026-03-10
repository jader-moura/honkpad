import { create } from 'zustand'
import { SoundEntry } from '../types/global'

interface SoundsState {
  sounds: SoundEntry[]
  loaded: boolean
  load: () => Promise<void>
  addSounds: (filePaths: string[]) => Promise<void>
  removeSound: (id: string) => Promise<void>
  setHotkey: (id: string, hotkey: string | null) => Promise<void>
}

function persist(sounds: SoundEntry[]) {
  window.electronAPI.saveSounds(sounds)
}

export const useSoundsStore = create<SoundsState>((set, get) => ({
  sounds: [],
  loaded: false,

  load: async () => {
    const sounds = await window.electronAPI.getSounds()
    set({ sounds, loaded: true })
  },

  addSounds: async (filePaths: string[]) => {
    const { sounds } = get()
    const newSounds: SoundEntry[] = filePaths.map((fp) => ({
      id: crypto.randomUUID(),
      name: fp.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? fp,
      filePath: fp,
      hotkey: null,
    }))
    const updated = [...sounds, ...newSounds]
    set({ sounds: updated })
    persist(updated)
  },

  removeSound: async (id: string) => {
    const updated = get().sounds.filter((s) => s.id !== id)
    set({ sounds: updated })
    persist(updated)
  },

  setHotkey: async (id: string, hotkey: string | null) => {
    // Remove same hotkey from any other sound first
    const updated = get().sounds.map((s) => ({
      ...s,
      hotkey: s.hotkey === hotkey && s.id !== id ? null : s.hotkey,
    })).map((s) => (s.id === id ? { ...s, hotkey } : s))
    set({ sounds: updated })
    persist(updated)
  },
}))
