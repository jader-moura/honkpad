# Soundboard

A desktop soundboard application for streamers and gamers built with **Electron + React + TypeScript**. Plays audio files instantly via configurable global hotkeys, routes audio to any output device (including virtual cables like VB-CABLE), and supports grouped sounds with random playback.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Data Model](#data-model)
- [IPC API Reference](#ipc-api-reference)
- [Audio Routing](#audio-routing)
- [Development](#development)
- [Building for Production](#building-for-production)
- [Key Design Decisions](#key-design-decisions)

---

## Features

- **Import audio files** — MP3, WAV, OGG, M4A, FLAC, AAC
- **Global hotkeys** — trigger sounds even when the app is not focused
- **Single-sound enforcement** — only one sound plays at a time; new play stops the previous
- **Output device routing** — route audio to any Windows audio output (e.g. VB-CABLE Input for mic injection)
- **Sound groups** — create named groups, add multiple sounds, assign a hotkey; pressing the hotkey plays a random sound from the group
- **In-group preview** — preview individual sounds inside the group editor
- **Persistent state** — sounds and groups survive app restarts via `electron-store`
- **Frameless window** — custom titlebar with minimize/maximize/close controls

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 31 |
| UI framework | React 18 + TypeScript |
| Build tool | Vite 5 + `vite-plugin-electron` |
| State management | Zustand 4 |
| Persistence | `electron-store` 8 |
| Icons | `lucide-react` |
| Audio playback | Web Audio API — `HTMLAudioElement` + `setSinkId()` |

---

## Project Structure

```
soundboard/
├── electron/
│   ├── main.ts          # Electron main process: window, IPC, global hotkeys, persistence
│   └── preload.ts       # Context bridge — exposes safe electronAPI to renderer
├── src/
│   ├── App.tsx          # Root component — playback engine, device picker, tabs, modals
│   ├── main.tsx         # React entry point
│   ├── components/
│   │   ├── SoundCard.tsx    # Individual sound card (play/stop/hotkey/remove)
│   │   ├── GroupCard.tsx    # Group card (shuffle play/edit/remove)
│   │   ├── GroupModal.tsx   # Create/edit group — name, sounds, hotkey, preview
│   │   ├── HotkeyModal.tsx  # Hotkey capture modal for individual sounds
│   │   └── EmptyState.tsx   # Zero-state prompt shown when no sounds are imported
│   ├── hooks/
│   │   └── useSounds.ts     # Zustand store — sounds + groups CRUD + persistence
│   ├── types/
│   │   └── global.d.ts      # SoundEntry, SoundGroup interfaces; Window.electronAPI types
│   └── styles/
│       └── index.css        # All styles — dark glassmorphism design system
├── index.html
├── vite.config.ts           # Vite + electron plugin config; externalises electron-store
├── tsconfig.json
└── package.json
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process (electron/main.ts)                    │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ electron-   │   │  ipcMain     │   │  globalShortcut  │  │
│  │ store       │   │  handlers    │   │  registration    │  │
│  │ (sounds +   │◄──│  get/save    │   │  (sound + group  │  │
│  │  groups)    │   │  sounds &    │   │   hotkeys)       │  │
│  └─────────────┘   │  groups      │   └────────┬─────────┘  │
│                    └──────────────┘            │             │
│                                                │ send('play-sound', id)
└────────────────────────────────────────────────┼─────────────┘
                                                 │
              contextBridge (preload.ts)          │
                                                 │
┌────────────────────────────────────────────────▼─────────────┐
│  Renderer Process (React)                                     │
│                                                               │
│  App.tsx                                                      │
│  ├── useSoundsStore (Zustand)  ←→  electronAPI.getSounds()    │
│  │                             ←→  electronAPI.getGroups()    │
│  ├── playSound(id)  ──►  new Audio(file://) + setSinkId()     │
│  ├── playGroupRandom(groupId)  ──►  picks random → playSound  │
│  ├── DevicePicker  ──►  enumerateDevices() → outputDeviceId   │
│  ├── SoundCard     ──►  play / stop / hotkey / remove         │
│  ├── GroupCard     ──►  shuffle play / edit / remove          │
│  └── GroupModal    ──►  CRUD group + in-modal sound preview   │
└───────────────────────────────────────────────────────────────┘
```

### Process communication

All cross-process communication uses Electron's **IPC** over the context bridge. The renderer never has direct access to Node.js APIs.

| Direction | Channel | Purpose |
|---|---|---|
| Renderer → Main | `get-sounds` | Load persisted sounds |
| Renderer → Main | `save-sounds` | Persist sounds + re-register hotkeys |
| Renderer → Main | `get-groups` | Load persisted groups |
| Renderer → Main | `save-groups` | Persist groups + re-register hotkeys |
| Renderer → Main | `open-file-dialog` | Native file picker |
| Renderer → Main | `window-minimize/maximize/close` | Window controls |
| Main → Renderer | `play-sound` | Hotkey fired — trigger playback in renderer |

---

## Data Model

### `SoundEntry`

```typescript
interface SoundEntry {
  id: string          // crypto.randomUUID()
  name: string        // filename without extension
  filePath: string    // absolute path on disk, e.g. C:\Users\...\beep.mp3
  hotkey: string | null  // Electron accelerator string, e.g. "F1", "Ctrl+2"
}
```

### `SoundGroup`

```typescript
interface SoundGroup {
  id: string           // crypto.randomUUID()
  name: string         // display name, e.g. "Áudios de zuação"
  hotkey: string | null
  soundIds: string[]   // ordered list of SoundEntry.id references
}
```

Both are stored in `electron-store` under keys `"sounds"` and `"groups"` respectively, in a JSON file at the OS user-data path.

---

## IPC API Reference

Exposed via `window.electronAPI` in the renderer:

```typescript
interface ElectronAPI {
  // Sounds
  getSounds(): Promise<SoundEntry[]>
  saveSounds(sounds: SoundEntry[]): Promise<void>

  // Groups
  getGroups(): Promise<SoundGroup[]>
  saveGroups(groups: SoundGroup[]): Promise<void>

  // File picker (returns array of absolute paths)
  openFileDialog(): Promise<string[]>

  // Hotkey event from main process
  // Returns an unsubscribe function — call it in useEffect cleanup
  onPlaySound(cb: (id: string) => void): () => void

  // Frameless window controls
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
}
```

---

## Audio Routing

### Playback engine

Audio is played using `HTMLAudioElement` with `setSinkId()` to route to a specific output device:

```typescript
const audio = new Audio(toFileUrl(sound.filePath))  // file:///C:/path/to/file.mp3
if (outputDeviceId) {
  await audio.setSinkId(outputDeviceId)  // route to CABLE Input, headphones, etc.
}
await audio.play()
```

`toFileUrl()` converts Windows backslash paths to valid `file:///` URLs:
```typescript
function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}
```

`webSecurity: false` is set on the BrowserWindow to allow `file://` protocol access from the renderer.

### Device enumeration

```typescript
await navigator.mediaDevices.getUserMedia({ audio: true }) // unlock device labels
const devices = await navigator.mediaDevices.enumerateDevices()
const outputs = devices.filter(d => d.kind === 'audiooutput')
```

Only output devices are enumerated. Stereo Mix (if present) is auto-detected by label matching.

### Routing to a virtual mic (VB-CABLE)

To make soundboard audio audible in games/Discord/OBS **without third-party software beyond VB-CABLE**:

```
Soundboard app  →  Output: CABLE Input (VB-Audio)
                        ↓
                   CABLE Output  →  set as microphone in game/Discord
```

For voice passthrough alongside soundboard sounds:
```
HyperX mic  →  mmsys.cpl → Recording → HyperX Properties
                → Listen tab → "Listen to this device"
                → Playback through: CABLE Input
```

This routes mic audio at the Windows driver level without any additional software.

### Hotkey registration (main process)

Hotkeys are Electron global accelerator strings (`"F1"`, `"Ctrl+Shift+2"`, etc.). They are registered in `globalShortcut` in the main process. When fired, the main process picks the target sound and sends `play-sound` to the renderer:

```typescript
// Individual sound
globalShortcut.register(sound.hotkey, () => {
  mainWindow?.webContents.send('play-sound', sound.id)
})

// Group — random pick happens in main process
globalShortcut.register(group.hotkey, () => {
  const pool = sounds.filter(s => group.soundIds.includes(s.id))
  const random = pool[Math.floor(Math.random() * pool.length)]
  mainWindow?.webContents.send('play-sound', random.id)
})
```

All hotkeys are re-registered whenever sounds or groups are saved.

---

## Development

### Prerequisites

- Node.js 20+
- Windows (the app targets Windows audio APIs via `setSinkId` and VB-CABLE)

### Install & run

```bash
cd soundboard
npm install
npm run dev
```

Vite starts a dev server and Electron launches automatically. DevTools open in a detached window.

Hot reload:
- **Renderer changes** (React/CSS): instant HMR via Vite
- **Main process changes**: Electron restarts automatically
- **Preload changes**: renderer reloads

### Common dev notes

- GPU cache errors in the console (`cache_util_win.cc`) are benign Electron/Windows noise — ignore them.
- `electron-store` is **externalised** from the Vite bundle (`rollupOptions.external`) so it is loaded as a native Node module. Do not attempt to bundle it.
- `Autofill.enable` DevTools errors are benign Chrome protocol noise.

---

## Building for Production

```bash
npm run build
```

This runs `vite build` (compiles renderer to `dist/`) then `electron-builder` (packages into a distributable). Output is in `dist/` (installer) and `dist-electron/` (compiled main process).

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `HTMLAudioElement` + `setSinkId` instead of Web Audio API | Better Electron compatibility for output device routing; `AudioContext.setSinkId` is newer and less reliable across Electron versions |
| No mic passthrough in app | Real-time mic capture through a custom AudioContext output breaks browser AEC (echo cancellation loses its reference signal), causing echo. Voice routing is handled at OS level via Windows mic monitoring |
| Single `playingId` in App state | Enforces one-sound-at-a-time rule; any new `playSound()` call stops the current audio before starting the next |
| Groups hotkey → random in main process | Avoids a separate IPC channel; the `play-sound` event is reused and the renderer's existing handler works unchanged |
| `electron-store` over SQLite | Zero setup, JSON-based, sufficient for the data volume (hundreds of sound entries) |
| `zustand` over Redux/Context | Minimal boilerplate for a small store; `useSoundsStore.getState()` allows access outside React render cycle (needed in `playSound` callback) |
| `webSecurity: false` | Required to load `file://` audio in the renderer; acceptable given the app only loads local user files |
