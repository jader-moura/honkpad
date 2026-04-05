# Release Checklist v1.0

Before releasing Honkpad v1.0, complete this smoke test on a fresh Windows install.

## Pre-Release Setup
- [ ] Update version in `package.json`
- [ ] Create git tag: `git tag v1.0.0`
- [ ] Push tag: `git push origin v1.0.0`
- [ ] GitHub Actions builds automatically and creates release

## Environment
- [ ] Clean Windows 11 VM or fresh install
- [ ] VB-Cable not pre-installed
- [ ] Test in both English and Portuguese

## Installation & Launch
- [ ] Download `Honkpad*.exe` from GitHub Releases
- [ ] Run installer (NSIS prompt)
- [ ] Accept license and custom install path
- [ ] Verify Honkpad shortcut created on Desktop and Start Menu
- [ ] Launch Honkpad from Desktop shortcut
- [ ] App appears in system tray
- [ ] Tray tooltip shows "Honkpad — pronto"

## VB-Cable Setup Flow
- [ ] On first launch, VB-Cable setup modal appears
- [ ] "Check Status" button detects VB-Cable as not installed
- [ ] "Install" button runs elevated installer (UAC prompt)
- [ ] Installation completes successfully
- [ ] App restarts or refreshes detection
- [ ] Status shows "VB-Cable installed" ✓

## Audio Routing (Dual Output)
- [ ] Settings > Audio Routing page loads
- [ ] Virtual Output (CABLE Input) auto-detected and selected
- [ ] Monitor Output shows available devices (speakers, headphones)
- [ ] Virtual Volume slider works (0-100%)
- [ ] Monitor Volume slider works (0-100%)

## Mic Passthrough
- [ ] Settings > Audio Routing > "Your Microphone"
- [ ] Select microphone from dropdown
- [ ] "Active" badge appears
- [ ] Deselect mic → badge disappears

## Sound Import & Playback
- [ ] Click "Importar Áudios" / "Import Audios"
- [ ] Select 3-5 MP3 files (any format: wav, ogg, m4a, flac, aac)
- [ ] Files appear in Sounds tab with waveforms visible
- [ ] Click play button on first sound
- [ ] Audio plays through both outputs (CABLE + Monitor)
- [ ] Waveform progress bar animates left-to-right
- [ ] Duration shows in MM:SS format below waveform
- [ ] Click stop button → audio stops immediately
- [ ] Play another sound → first sound stops, new one plays

## Hotkeys
- [ ] Click hotkey badge on a sound
- [ ] Hotkey modal appears
- [ ] Press custom key combination (e.g., Ctrl+Alt+1)
- [ ] Hotkey displays in badge
- [ ] Hotkey works from anywhere (minimize app, switch tabs)
- [ ] Press hotkey → sound plays through both outputs
- [ ] Set another sound to same hotkey → first hotkey clears, second activates
- [ ] Stop All Hotkey in Settings (default Ctrl+Shift+S)
- [ ] Stop All Hotkey stops all playing sounds

## Groups
- [ ] Click "New Group" / "Novo Grupo"
- [ ] Modal opens to create group
- [ ] Select 2-3 sounds for group
- [ ] Save group → appears in Groups tab
- [ ] Click play button on group → random sound from group plays
- [ ] Create second group with overlapping sounds
- [ ] Both groups work independently

## Waveform Visualization
- [ ] All imported sounds show waveform bars
- [ ] Waveforms vary (louder clips have taller bars)
- [ ] During playback, progress bar fills left-to-right
- [ ] Duration displays correctly (e.g., "2:34")
- [ ] Silent sections show flat waveforms

## Internationalization
- [ ] Settings > Language selector visible
- [ ] Select "Português (Brasil)"
- [ ] All UI text changes to Portuguese immediately
- [ ] Select "English (US)"
- [ ] All UI text changes to English immediately
- [ ] Select "Español (España)"
- [ ] All UI text changes to Spanish
- [ ] Return to Portuguese
- [ ] Preference persists after app restart

## System Tray
- [ ] Double-click tray icon → window shows
- [ ] Click "Open" / "Abrir" → window shows
- [ ] Click "Stop All" / "Parar todos" → stops playing sounds
- [ ] Click "Check Updates" / "Verificar atualizações" → check dialog
- [ ] Right-click tray → context menu (Open, Stop All, Check Updates, Exit)
- [ ] Click "Exit" / "Sair" → app closes (no tray icon in notification area)

## Auto-Updater (if v1.0.1 is available)
- [ ] Launch Honkpad v1.0.0
- [ ] Tray > Check Updates (or automatic on startup)
- [ ] Update dialog appears: "Honkpad X.X.X is available"
- [ ] Click "Update" → download begins
- [ ] Once downloaded: "Update ready to install" dialog
- [ ] Click "Install Now" → Honkpad restarts with new version
- [ ] Verify version number changed

## Edge Cases
- [ ] Minimize to tray while sound playing
- [ ] Restore from tray → sound continues
- [ ] Play sound, minimize, click stop from tray → sound stops
- [ ] Import a corrupted/invalid audio file
- [ ] App displays error gracefully, other sounds work
- [ ] Long sound name (>80 chars) truncates in card
- [ ] File path with special chars: ñ, é, 中文, emoji
- [ ] Files in nested folders (Documents/Music/Sounds/file.mp3)
- [ ] Unplug and replug audio interface
- [ ] Toggle monitor output device mid-playback
- [ ] Close app while sound playing
- [ ] Reopen app → tray was still alive, sound stopped

## Performance
- [ ] Import 50+ sounds without lag
- [ ] Scroll through sound list smoothly
- [ ] Language switch happens instantly
- [ ] Waveform rendering <100ms per sound
- [ ] Memory usage stable (no leaks during 10-min session)

## Cleanup & Finalization
- [ ] Uninstall via Control Panel "Remove Programs"
- [ ] Verify all files removed except user data (sounds folder)
- [ ] No leftover registry entries or tray items
- [ ] Reinstall and verify fresh install still works
- [ ] Document any issues found in GitHub Issues
- [ ] Close all issues addressed in v1.0
- [ ] Create announcement/release notes

## Release Sign-Off
- [ ] All checks passed ✓
- [ ] No critical bugs
- [ ] Test on 2+ machines (VM + physical if possible)
- [ ] Ship it! 🚀

---

**Date Tested:** ________________
**Tester Name:** ________________
**Notes:** _____________________________________________________________________
_______________________________________________________________________________
