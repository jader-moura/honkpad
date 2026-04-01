# AGENTS.md — AI Assistant Context for Soundboard

This file gives AI coding assistants immediate, accurate context about this project.
Read this before making any changes.

---

## What this project is

A Windows desktop soundboard app (Electron + React + TypeScript) for streamers/gamers.
Users import audio files, assign global hotkeys, and play sounds instantly — with audio
routed to a virtual cable device so others on calls/games hear the sounds via microphone.

---

## Critical architecture facts

### Two processes — never confuse them

| Process | Entry | Can access |
|---|---|---|
| **Main** | `electron/main.ts` | Node.js, `electron-store`, `globalShortcut`, `dialog`, `ipcMain` |
| **Renderer** | `src/main.tsx` → `src/App.tsx` | React, Web APIs, `window.electronAPI` only |

The renderer **cannot** import anything from `electron/` or use Node APIs directly.
All cross-process calls go through `window.electronAPI` (defined in `electron/preload.ts`).

### Adding a new IPC channel — required steps (all 3)

1. **`electron/main.ts`** — add `ipcMain.handle('channel-name', handler)`
2. **`electron/preload.ts`** — expose it via `contextBridge.exposeInMainWorld`
3. **`src/types/global.d.ts`** — add the method to the `Window.electronAPI` interface

Missing any one of these causes a silent runtime error.

### State management

- **`src/hooks/useSounds.ts`** is the single Zustand store for all app data (sounds + groups).
- Every mutation calls `persistSounds()` or `persistGroups()` (IPC to main → electron-store).
- Access store outside React with `useSoundsStore.getState()` (needed in async callbacks).

---

## File-by-file responsibilities

```
electron/main.ts       — BrowserWindow creation, all IPC handlers, globalShortcut registration,
                         electron-store read/write. Re-registers ALL hotkeys on every save.

electron/preload.ts    — Thin bridge. Only re-exports IPC calls + ipcRenderer.on wrappers.
                         Keep it dumb — no logic here.

src/types/global.d.ts  — Source of truth for SoundEntry, SoundGroup types and electronAPI shape.
                         Both main process and renderer have their own copies of the interfaces
                         (preload.ts duplicates them because it cannot import from src/).

src/App.tsx            — Core playback engine + all UI orchestration.
                         Contains: playSound(), stopSound(), playGroupRandom(), DevicePicker,
                         tabs (Sons/Grupos), stereo guide modal, device enumeration.

src/hooks/useSounds.ts — All CRUD: addSounds, removeSound, setHotkey, addGroup, removeGroup,
                         updateGroup. Removing a sound also removes it from all groups.

src/components/
  SoundCard.tsx        — Pure display. All callbacks (onPlay, onStop, onRemove, onHotkeyClick)
                         come from App.tsx. No internal audio logic.
  GroupCard.tsx        — Group display. onPlayRandom → App.tsx → picks random → playSound().
  GroupModal.tsx       — Self-contained modal with its own audio preview (HTMLAudioElement,
                         local to modal, stops on unmount). Includes hotkey capture sub-step.
  HotkeyModal.tsx      — Standalone hotkey capture modal for individual sounds.
  EmptyState.tsx       — Zero-state UI, shown when sounds.length === 0 && groups.length === 0.

src/styles/index.css   — All styles. Uses CSS custom properties (--violet, --surface, etc.).
                         No CSS modules, no Tailwind. Append new styles at the end.
```

---

## Audio playback — how it works

```typescript
// In App.tsx — the ONLY place audio is played (except GroupModal preview)
const audio = new Audio(toFileUrl(sound.filePath))
if (outputDeviceId) await audio.setSinkId(outputDeviceId)
await audio.play()
```

- `toFileUrl()` converts `C:\path\file.mp3` → `file:///C:/path/file.mp3`
- `webSecurity: false` in BrowserWindow allows `file://` in renderer
- `setSinkId()` routes audio to a specific output device (e.g. VB-CABLE Input)
- Only ONE sound plays at a time — `stopCurrentRef.current?.()` is called before every new play
- `playingId` state drives visual feedback on SoundCard and GroupCard

---

## Hotkeys — format and gotchas

- Format: Electron accelerator strings — `"F1"`, `"Ctrl+2"`, `"Alt+Shift+Z"`
- Registered in **main process** via `globalShortcut.register()`
- Main sends `play-sound` IPC event → renderer plays audio
- **All hotkeys must be unique** — the store deduplicates (a hotkey can only belong to one
  sound OR one group; assigning it elsewhere clears the previous assignment)
- `registerAllHotkeys()` in main.ts does `globalShortcut.unregisterAll()` first,
  then re-registers everything. Called after every `save-sounds` or `save-groups`.

---

## What NOT to do

- **Do not import `electron` in renderer code** — it will crash. Use `window.electronAPI`.
- **Do not bundle `electron-store`** — it is listed in `vite.config.ts` `external`. Keep it there.
- **Do not add mic capture/passthrough via Web Audio** — tried, causes echo. Voice routing
  is handled at OS level (Windows mic monitoring → CABLE Input).
- **Do not use `AudioContext.setSinkId()`** — less reliable in Electron than `HTMLAudioElement.setSinkId()`.
- **Do not play audio inside the Zustand store** — keep playback in App.tsx only.

---

## Common tasks

### Add a new sound action (e.g. volume control)
1. Add field to `SoundEntry` in `src/types/global.d.ts`
2. Update `useSounds.ts` store (new action + persist call)
3. Update `SoundCard.tsx` to show the new control
4. Update `electron/main.ts` and `electron/preload.ts` if new IPC needed

### Add a new IPC channel
```typescript
// electron/main.ts
ipcMain.handle('my-channel', (_, arg) => { /* ... */ })

// electron/preload.ts  
myAction: (arg: string): Promise<void> => ipcRenderer.invoke('my-channel', arg),

// src/types/global.d.ts  (inside Window.electronAPI)
myAction: (arg: string) => Promise<void>
```

### Add CSS
Append to `src/styles/index.css`. Follow existing patterns:
- Use `var(--violet)`, `var(--surface)`, `var(--border)`, `var(--text-muted)` etc.
- Use `var(--radius-sm)` for border-radius, `var(--transition)` for transitions.
- Do not add inline styles to components unless overriding a single property.

### Run TypeScript check
```bash
npx tsc --noEmit
```
Run this after any structural change to catch IPC type mismatches early.
