import { create } from 'zustand'
import { SoundEntry, SoundGroup } from '../types/global'

interface SoundsState {
  sounds: SoundEntry[]
  groups: SoundGroup[]
  loaded: boolean
  load: () => Promise<void>
  addSounds: (filePaths: string[]) => Promise<void>
  removeSound: (id: string) => Promise<void>
  setHotkey: (id: string, hotkey: string | null) => Promise<void>
  // Groups
  addGroup: (name: string) => Promise<SoundGroup>
  removeGroup: (id: string) => Promise<void>
  updateGroup: (group: SoundGroup) => Promise<void>
}

function persistSounds(sounds: SoundEntry[]) {
  window.electronAPI.saveSounds(sounds)
}

function persistGroups(groups: SoundGroup[]) {
  window.electronAPI.saveGroups(groups)
}

export const useSoundsStore = create<SoundsState>((set, get) => ({
  sounds: [],
  groups: [],
  loaded: false,

  load: async () => {
    const [sounds, groups] = await Promise.all([
      window.electronAPI.getSounds(),
      window.electronAPI.getGroups(),
    ])
    set({ sounds, groups, loaded: true })
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
    persistSounds(updated)
  },

  removeSound: async (id: string) => {
    const { sounds, groups } = get()
    const updatedSounds = sounds.filter((s) => s.id !== id)
    // Also remove sound from any groups it belongs to
    const updatedGroups = groups.map(g => ({
      ...g,
      soundIds: g.soundIds.filter(sid => sid !== id),
    }))
    set({ sounds: updatedSounds, groups: updatedGroups })
    persistSounds(updatedSounds)
    persistGroups(updatedGroups)
  },

  setHotkey: async (id: string, hotkey: string | null) => {
    const updated = get().sounds.map((s) => ({
      ...s,
      hotkey: s.hotkey === hotkey && s.id !== id ? null : s.hotkey,
    })).map((s) => (s.id === id ? { ...s, hotkey } : s))
    set({ sounds: updated })
    persistSounds(updated)
  },

  // ── Groups ────────────────────────────────────────────────────────────────

  addGroup: async (name: string) => {
    const newGroup: SoundGroup = {
      id: crypto.randomUUID(),
      name,
      hotkey: null,
      soundIds: [],
    }
    const updated = [...get().groups, newGroup]
    set({ groups: updated })
    persistGroups(updated)
    return newGroup
  },

  removeGroup: async (id: string) => {
    const updated = get().groups.filter(g => g.id !== id)
    set({ groups: updated })
    persistGroups(updated)
  },

  updateGroup: async (group: SoundGroup) => {
    const { groups } = get()
    // If hotkey is being set, clear it from any other group
    const updated = groups.map(g => ({
      ...g,
      hotkey: g.hotkey === group.hotkey && g.id !== group.id ? null : g.hotkey,
    })).map(g => g.id === group.id ? group : g)
    set({ groups: updated })
    persistGroups(updated)
  },
}))
