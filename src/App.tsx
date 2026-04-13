import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setLanguage, type LanguageCode } from './i18n'
import { useSoundsStore } from './hooks/useSounds'
import { HonkpadLogo } from './components/HonkpadLogo'
import { SoundCard } from './components/SoundCard'
import { GroupCard } from './components/GroupCard'
import { GroupModal } from './components/GroupModal'
import { HotkeyModal } from './components/HotkeyModal'
import { EmptyState } from './components/EmptyState'
import { VBCableSetup } from './components/VBCableSetup'
import { ConflictWarning } from './components/ConflictWarning'
import { DebugPanel } from './components/DebugPanel'
import { ImportModal } from './components/ImportModal'
import { VoiceEffectsPage } from './components/VoiceEffectsPage'
import { SoundGroup, VBCableStatus, ConflictInfo } from './types/global'
import {
  Minus, Square, X, Music2, FolderOpen,
  Volume2, ChevronDown, Plus, Layers, Cable, Monitor, Mic, MicOff, Settings, Search, StopCircle, Keyboard, RefreshCw, Download
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioDevice {
  deviceId: string
  label: string
  isCableInput: boolean
}

interface InputDevice {
  deviceId: string
  label: string
}

export interface VoiceEffectsSettings {
  enabled: boolean
  testMode: boolean
  noiseGate: { enabled: boolean; threshold: number }
  robot: { enabled: boolean; frequency: number }
  telephone: { enabled: boolean }
  reverb: { enabled: boolean; decay: number }
  kidVoice: { enabled: boolean; gain: number }
  ladyVoice: { enabled: boolean; gain: number }
}

// ─── Hotkey Helpers ───────────────────────────────────────────────────────────

function formatHotkeyDisplay(keys: string[]): string {
  const order = ['Control', 'Alt', 'Shift', 'Meta']
  const mods = keys.filter(k => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const normals = keys.filter(k => !order.includes(k))
  return [...mods, ...normals]
    .map(k => k === 'Control' ? 'Ctrl' : k === ' ' ? 'Space' : k)
    .join('+')
}

function formatHotkeyElectron(keys: string[]): string {
  const map: Record<string, string> = {
    Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Super',
    ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  }
  const order = ['Control', 'Alt', 'Shift', 'Meta']
  const mods = keys.filter(k => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const normals = keys.filter(k => !order.includes(k))
  return [...mods, ...normals].map(k => map[k] ?? (k.length === 1 ? k.toUpperCase() : k)).join('+')
}

function isCableInputDevice(label: string): boolean {
  const l = label.toLowerCase()
  return l.includes('cable input')
}

function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

// ─── Voice Effects Helpers ────────────────────────────────────────────────────

function buildImpulseResponse(ctx: AudioContext, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * decay)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  }
  return buf
}

function buildEffectChain(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  settings: VoiceEffectsSettings,
  refs: {
    robotOsc: React.MutableRefObject<OscillatorNode | null>
    reverbNode: React.MutableRefObject<ConvolverNode | null>
    gateNode: React.MutableRefObject<ScriptProcessorNode | null>
    analyser: React.MutableRefObject<AnalyserNode | null>
    noiseThresh: React.MutableRefObject<number>
  }
): AudioNode {
  let last: AudioNode = source

  // 1. Noise gate
  if (settings.noiseGate.enabled) {
    const gate = ctx.createScriptProcessor(2048, 1, 1)
    refs.noiseThresh.current = settings.noiseGate.threshold
    refs.gateNode.current = gate  // Keep reference to prevent GC
    gate.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      const output = e.outputBuffer.getChannelData(0)
      let sum = 0
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
      const rms = Math.sqrt(sum / input.length)
      output.set(rms > refs.noiseThresh.current ? input : new Float32Array(input.length))
    }
    last.connect(gate)
    // Silent drain to ctx.destination ensures onaudioprocess fires
    const silentGain = ctx.createGain()
    silentGain.gain.value = 0
    gate.connect(silentGain)
    silentGain.connect(ctx.destination)
    last = gate
  }

  // 2. Robot — ring modulation
  if (settings.robot.enabled) {
    const osc = ctx.createOscillator()
    osc.frequency.value = settings.robot.frequency
    const ringGain = ctx.createGain()
    ringGain.gain.value = 0
    osc.connect(ringGain.gain)
    osc.start()
    refs.robotOsc.current = osc
    last.connect(ringGain)
    last = ringGain
  }

  // 3. Telephone — highpass 300Hz → lowpass 3400Hz
  if (settings.telephone.enabled) {
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 300
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 3400
    last.connect(hp)
    hp.connect(lp)
    last = lp
  }

  // 4. Reverb
  if (settings.reverb.enabled) {
    const conv = ctx.createConvolver()
    conv.buffer = buildImpulseResponse(ctx, settings.reverb.decay)
    refs.reverbNode.current = conv
    last.connect(conv)
    last = conv
  }

  // 5. Kid Voice — high-shelf + ring mod
  if (settings.kidVoice.enabled) {
    const shelf = ctx.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 3000
    shelf.gain.value = settings.kidVoice.gain
    const kidOsc = ctx.createOscillator()
    kidOsc.frequency.value = 800
    const kidGain = ctx.createGain()
    kidGain.gain.value = 0.5
    kidOsc.connect(kidGain.gain)
    kidOsc.start()
    last.connect(shelf)
    shelf.connect(kidGain)
    last = kidGain
  }

  // 6. Lady Voice — high-shelf + peaking
  if (settings.ladyVoice.enabled) {
    const ladyShelf = ctx.createBiquadFilter()
    ladyShelf.type = 'highshelf'
    ladyShelf.frequency.value = 2000
    ladyShelf.gain.value = settings.ladyVoice.gain
    const peak = ctx.createBiquadFilter()
    peak.type = 'peaking'
    peak.frequency.value = 1800
    peak.Q.value = 2.0
    peak.gain.value = 4
    last.connect(ladyShelf)
    ladyShelf.connect(peak)
    last = peak
  }

  // Add AnalyserNode for real-time level monitoring
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.5
  last.connect(analyser)
  refs.analyser.current = analyser

  return analyser
}

// ─── Device Picker (dual-mode) ────────────────────────────────────────────────

interface DevicePickerProps {
  devices: AudioDevice[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  label: string
  icon: React.ReactNode
  accentClass?: string
}

function DevicePicker({ devices, selectedId, onSelect, label, icon, accentClass }: DevicePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const selected = devices.find(d => d.deviceId === selectedId)

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const selectorRect = buttonRef.current.parentElement?.getBoundingClientRect()
      console.log('[DevicePicker] Opening menu', { rect, selectorRect, open })
      if (selectorRect) {
        setMenuPos({
          top: rect.height + 8, // Relative to parent
          left: rect.left - selectorRect.left,
        })
      }
    }
    setOpen(v => !v)
  }

  return (
    <div className="device-selector" onClick={e => e.stopPropagation()}>
      <button
        ref={buttonRef}
        className={`device-btn ${open ? 'open' : ''} ${selectedId ? 'active' : ''} ${accentClass || ''}`}
        onClick={handleOpen}
        title={label}
      >
        {icon}
        <span className="device-label">{selected?.label ?? t('audio.systemDefault')}</span>
        <ChevronDown size={12} className={`chevron ${open ? 'rotated' : ''}`} />
      </button>

      {open && (
        <div className="device-menu" style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}>
          <div className="device-menu-header">{label}</div>
          <button
            className={`device-menu-item ${!selectedId ? 'active' : ''}`}
            onClick={() => { onSelect(null); setOpen(false) }}
          >
            {t('audio.systemDefault')}
          </button>
          {devices.map(d => (
            <button
              key={d.deviceId}
              className={`device-menu-item ${d.deviceId === selectedId ? 'active' : ''} ${d.isCableInput ? 'cable-device' : ''}`}
              onClick={() => { onSelect(d.deviceId); setOpen(false) }}
            >
              {d.isCableInput && <span className="badge-sm">Virtual</span>}
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Volume Slider ────────────────────────────────────────────────────────────

interface VolumeSliderProps {
  value: number
  onChange: (v: number) => void
  label: string
}

function VolumeSlider({ value, onChange, label }: VolumeSliderProps) {
  return (
    <div className="volume-control">
      <Volume2 size={12} />
      <input
        type="range"
        className="volume-slider"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        title={`${label}: ${Math.round(value * 100)}%`}
      />
      <span className="volume-value">{Math.round(value * 100)}%</span>
    </div>
  )
}

// ─── Mic Picker ───────────────────────────────────────────────────────────────

interface MicPickerProps {
  devices: InputDevice[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function MicPicker({ devices, selectedId, onSelect }: MicPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = devices.find(d => d.deviceId === selectedId)

  return (
    <>
      <button
        className={`device-btn ${open ? 'open' : ''} ${selectedId ? 'active mic-active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Selecionar microfone"
      >
        {selectedId ? <Mic size={13} /> : <MicOff size={13} />}
        <span className="device-label">{selected?.label ?? 'Nenhum (voz desativada)'}</span>
        <ChevronDown size={12} className={`chevron ${open ? 'rotated' : ''}`} />
      </button>

      {open && (
        <div className="device-menu">
          <div className="device-menu-header">Microfone real</div>
          <button
            className={`device-menu-item ${!selectedId ? 'active' : ''}`}
            onClick={() => { onSelect(null); setOpen(false) }}
          >
            Nenhum — voz desativada
          </button>
          {devices.map(d => (
            <button
              key={d.deviceId}
              className={`device-menu-item ${d.deviceId === selectedId ? 'active' : ''}`}
              onClick={() => { onSelect(d.deviceId); setOpen(false) }}
            >
              {d.label}
            </button>
          ))}
          <div className="device-menu-hint">
            Sua voz será encaminhada pelo CABLE junto com os sons do honkpad.
          </div>
        </div>
      )}
    </>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

type Tab = 'sounds' | 'groups' | 'settings' | 'voiceEffects'

export default function App() {
  const { t } = useTranslation()
  const { sounds, groups, loaded, load, addSounds, removeSound, setHotkey,
    addGroup, removeGroup, updateGroup } = useSoundsStore()

  const [tab, setTab] = useState<Tab>('sounds')
  const [soundSearch, setSoundSearch] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [modalSoundId, setModalSoundId] = useState<string | null>(null)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  // ── Dual audio routing state ──
  const [cableInputDeviceId, setCableInputDeviceId] = useState<string | null>(() => localStorage.getItem('sdb_cableInput') || null)
  const [monitorDeviceId, setMonitorDeviceId] = useState<string | null>(() => localStorage.getItem('sdb_monitor') || null)
  const [virtualVolume, setVirtualVolume] = useState(() => {
    const saved = localStorage.getItem('sdb_volVirtual')
    return saved !== null ? Number(saved) : 1.0
  })
  const [monitorVolume, setMonitorVolume] = useState(() => {
    const saved = localStorage.getItem('sdb_volMonitor')
    return saved !== null ? Number(saved) : 1.0
  })
  const [outputs, setOutputs] = useState<AudioDevice[]>([])

  // ── Mic passthrough state ──
  const [inputs, setInputs] = useState<InputDevice[]>([])
  const [micDeviceId, setMicDeviceId] = useState<string | null>(() => localStorage.getItem('sdb_mic') || null)
  const [micPassthroughActive, setMicPassthroughActive] = useState(false)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micAudioRef = useRef<HTMLAudioElement | null>(null)

  // ── Voice Effects state ──
  const [voiceEffects, setVoiceEffects] = useState<VoiceEffectsSettings>(() => {
    const saved = localStorage.getItem('sdb_voiceFx')
    return saved ? JSON.parse(saved) : {
      enabled: false,
      testMode: false,
      noiseGate: { enabled: false, threshold: 0.02 },
      robot: { enabled: false, frequency: 30 },
      telephone: { enabled: false },
      reverb: { enabled: false, decay: 2.0 },
      kidVoice: { enabled: false, gain: 8 },
      ladyVoice: { enabled: false, gain: 5 },
    }
  })

  // ── Persistence ──
  useEffect(() => { if (cableInputDeviceId) localStorage.setItem('sdb_cableInput', cableInputDeviceId) }, [cableInputDeviceId])
  useEffect(() => { if (monitorDeviceId) localStorage.setItem('sdb_monitor', monitorDeviceId) }, [monitorDeviceId])
  useEffect(() => {
    if (micDeviceId) localStorage.setItem('sdb_mic', micDeviceId)
    else localStorage.removeItem('sdb_mic')
  }, [micDeviceId])
  useEffect(() => { localStorage.setItem('sdb_volVirtual', virtualVolume.toString()) }, [virtualVolume])
  useEffect(() => { localStorage.setItem('sdb_volMonitor', monitorVolume.toString()) }, [monitorVolume])
  useEffect(() => { localStorage.setItem('sdb_voiceFx', JSON.stringify(voiceEffects)) }, [voiceEffects])

  // ── VB-Cable state ──
  const [showVBCableSetup, setShowVBCableSetup] = useState(false)
  const [vbcableStatus, setVbcableStatus] = useState<VBCableStatus | null>(null)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [conflictDismissed, setConflictDismissed] = useState(false)
  const [showDebug, setShowDebug] = useState(false)

  // ── Debug helpers ──
  useEffect(() => {
    (window as any).debugHonkpad = {
      resetVBCableFlag: async () => {
        await window.electronAPI.setVBCableFlag(false)
        window.location.reload()
      },
      showVBCableSetup: () => setShowVBCableSetup(true),
      hideVBCableSetup: () => setShowVBCableSetup(false),
      getVBCableFlag: async () => await window.electronAPI.getVBCableFlag(),
    }
    console.log('Debug helpers available: window.debugHonkpad')
  }, [])

  // ── Stop hotkey settings ──
  const [stopHotkey, setStopHotkeyState] = useState('Ctrl+Shift+S')
  const [capturingStopHotkey, setCapturingStopHotkey] = useState(false)
  const [capturedStopKeys, setCapturedStopKeys] = useState<string[]>([])

  const stopCurrentRef = useRef<(() => void) | null>(null)

  // ── Voice Effects refs ──
  const audioCtxRef = useRef<AudioContext | null>(null)
  const fxDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const fxCableAudioRef = useRef<HTMLAudioElement | null>(null)
  const fxMonitorAudioRef = useRef<HTMLAudioElement | null>(null)
  const robotOscRef = useRef<OscillatorNode | null>(null)
  const reverbNodeRef = useRef<ConvolverNode | null>(null)
  const gateNodeRef = useRef<ScriptProcessorNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const noiseThreshRef = useRef<number>(0.02)

  // ── Playback progress tracking ──
  const [playbackProgress, setPlaybackProgress] = useState<number>(0)
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const updatePlaybackProgress = useCallback(() => {
    if (playbackAudioRef.current && playingId) {
      const { currentTime, duration } = playbackAudioRef.current
      if (duration > 0) {
        setPlaybackProgress(currentTime / duration)
      }
      animationFrameRef.current = requestAnimationFrame(updatePlaybackProgress)
    }
  }, [playingId])

  useEffect(() => {
    if (playingId) {
      animationFrameRef.current = requestAnimationFrame(updatePlaybackProgress)
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [playingId, updatePlaybackProgress])

  useEffect(() => { load() }, [load])

  // ── VB-Cable check on launch ──
  useEffect(() => {
    async function initVBCable() {
      try {
        const alreadyChecked = await window.electronAPI.getVBCableFlag()
        console.log('[VBCable] Flag check result:', alreadyChecked)
        if (!alreadyChecked) {
          console.log('[VBCable] Showing setup overlay')
          setShowVBCableSetup(true)
          return
        }
        // Already checked before — just grab status for debug panel
        const status = await window.electronAPI.checkVBCable()
        setVbcableStatus(status)
        // Check for conflicts
        const conflictResult = await window.electronAPI.detectConflicts()
        setConflict(conflictResult)
      } catch (err) {
        console.error('[VBCable] Error:', err)
        // silently continue
      }
    }
    initVBCable()
  }, [])

  // ── Audio device enumeration with auto-detect ──
  useEffect(() => {
    async function loadDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch((err) => {
          console.warn('[Audio] getUserMedia permission check failed:', err?.message)
        })
        const all = await navigator.mediaDevices.enumerateDevices()
        console.log('[Audio] Device enumeration — Total:', all.length, '| Audio output:', all.filter(d => d.kind === 'audiooutput').length, '| Audio input:', all.filter(d => d.kind === 'audioinput').length)

        // Output devices
        const outputDevices = all.filter(d => d.kind === 'audiooutput').map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Dispositivo (${d.deviceId.slice(0, 8)}…)`,
          isCableInput: isCableInputDevice(d.label),
        }))
        setOutputs(outputDevices)
        outputDevices.forEach(d => console.log('[Audio Output]', d.label, d.isCableInput ? '(CABLE)' : ''))

        // Input devices (mics) — exclude CABLE Output (it's not a real mic)
        const inputDevices = all
          .filter(d => d.kind === 'audioinput')
          .filter(d => !d.label.toLowerCase().includes('cable output'))
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Microfone (${d.deviceId.slice(0, 8)}…)`,
          }))
        setInputs(inputDevices)
        inputDevices.forEach(d => console.log('[Audio Input]', d.label))

        // Validate stored CABLE Input — if stale, clear and re-detect
        const currentCable = cableInputDeviceId
        if (currentCable && !outputDevices.find(d => d.deviceId === currentCable)) {
          console.log('[Audio] Stored CABLE Input device no longer available, re-detecting…')
          setCableInputDeviceId(null)
          localStorage.removeItem('sdb_cableInput')
        }

        // Validate stored monitor — if stale, clear and re-detect
        const currentMonitor = monitorDeviceId
        if (currentMonitor && !outputDevices.find(d => d.deviceId === currentMonitor)) {
          console.log('[Audio] Stored monitor device no longer available, re-detecting…')
          setMonitorDeviceId(null)
          localStorage.removeItem('sdb_monitor')
        }

        // Validate stored mic — if stale, clear
        const currentMic = micDeviceId
        if (currentMic && !inputDevices.find(d => d.deviceId === currentMic)) {
          console.log('[Audio] Stored mic device no longer available, clearing…')
          setMicDeviceId(null)
          localStorage.removeItem('sdb_mic')
        }

        // Auto-detect CABLE Input if not set or was just cleared
        const effectiveCable = (currentCable && outputDevices.find(d => d.deviceId === currentCable)) ? currentCable : null
        if (!effectiveCable) {
          const cable = outputDevices.find(d => d.isCableInput)
          if (cable) {
            setCableInputDeviceId(cable.deviceId)
          }
        }

        // Auto-detect monitor output if not set or was just cleared
        const effectiveMonitor = (currentMonitor && outputDevices.find(d => d.deviceId === currentMonitor)) ? currentMonitor : null
        if (!effectiveMonitor) {
          const monitor = outputDevices.find(
            d => !d.isCableInput && d.deviceId !== 'default' && d.deviceId !== 'communications'
          )
          if (monitor) {
            setMonitorDeviceId(monitor.deviceId)
          }
        }
      } catch { /* permissions denied */ }
    }
    loadDevices()
    navigator.mediaDevices.addEventListener('devicechange', loadDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic passthrough engine ──
  // Captures user's real mic and routes it to CABLE Input so others hear voice + sounds.
  // With effects enabled, routes through Web Audio API for processing.
  useEffect(() => {
    let cancelled = false

    async function startPassthrough() {
      stopMicPassthrough()

      if (!micDeviceId || !cableInputDeviceId) {
        setMicPassthroughActive(false)
        return
      }

      try {
        console.log('[Mic Passthrough] Requesting stream for device:', micDeviceId)
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: micDeviceId }, echoCancellation: true, noiseSuppression: false, autoGainControl: false }
        })
        console.log('[Mic Passthrough] Stream acquired, tracks:', stream.getAudioTracks().length)
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        if (!voiceEffects.enabled) {
          // ── Branch A: Direct passthrough (no effects) ──
          const audio = new Audio()
          audio.srcObject = stream

          let setSinkSuccess = false
          try {
            const setSink = (audio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId
            if (setSink) {
              await setSink.call(audio, cableInputDeviceId)
              setSinkSuccess = true
              console.log('[Mic Passthrough] setSinkId succeeded:', cableInputDeviceId)
            }
          } catch (err) {
            console.warn('[Mic Passthrough] setSinkId failed:', err)
          }

          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

          if (setSinkSuccess) {
            await new Promise(resolve => setTimeout(resolve, 50))
          }

          await audio.play()
          micStreamRef.current = stream
          micAudioRef.current = audio
          setMicPassthroughActive(true)
          console.log('[Mic Passthrough] Active: direct path (no effects)')
        } else {
          // ── Branch B: Effects processing via AudioContext ──
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          audioCtxRef.current = ctx

          const source = ctx.createMediaStreamSource(stream)
          const lastNode = buildEffectChain(ctx, source, voiceEffects, {
            robotOsc: robotOscRef,
            reverbNode: reverbNodeRef,
            gateNode: gateNodeRef,
            analyser: analyserRef,
            noiseThresh: noiseThreshRef,
          })
          const dest = ctx.createMediaStreamDestination()
          fxDestRef.current = dest
          lastNode.connect(dest)

          // CABLE output
          const cableAudio = new Audio()
          cableAudio.srcObject = dest.stream
          cableAudio.volume = 1.0

          try {
            const setSink = (cableAudio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId
            if (setSink) {
              await setSink.call(cableAudio, cableInputDeviceId)
              console.log('[Mic Passthrough] (effects) setSinkId succeeded for CABLE')
            }
          } catch (err) {
            console.warn('[Mic Passthrough] (effects) setSinkId failed for CABLE:', err)
          }

          if (cancelled) {
            stream.getTracks().forEach(t => t.stop())
            ctx.close()
            return
          }

          await cableAudio.play()
          fxCableAudioRef.current = cableAudio

          // Test mode monitor output
          if (voiceEffects.testMode) {
            console.log('[Mic Passthrough] Test mode active, monitorDeviceId:', monitorDeviceId, 'dest.stream:', !!dest.stream)
            const monitorAudio = new Audio()
            monitorAudio.srcObject = dest.stream
            monitorAudio.volume = virtualVolume
            console.log('[Mic Passthrough] Test mode audio element created with volume:', virtualVolume)

            if (monitorDeviceId) {
              try {
                const setSink = (monitorAudio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId
                if (setSink) {
                  await setSink.call(monitorAudio, monitorDeviceId)
                  console.log('[Mic Passthrough] setSinkId succeeded for monitor device:', monitorDeviceId)
                } else {
                  console.warn('[Mic Passthrough] setSinkId not available, audio will play through default device')
                }
              } catch (err) {
                console.warn('[Mic Passthrough] setSinkId failed, falling back to default device:', err)
              }
            } else {
              console.warn('[Mic Passthrough] No monitorDeviceId set, using default device')
            }

            try {
              await monitorAudio.play()
              fxMonitorAudioRef.current = monitorAudio
              console.log('[Mic Passthrough] Test mode audio started playing')
            } catch (err) {
              console.error('[Mic Passthrough] Failed to play test mode audio:', err)
            }
          }

          micStreamRef.current = stream
          setMicPassthroughActive(true)
          console.log('[Mic Passthrough] Active: effects enabled, echoCancellation=true')
        }
      } catch (err) {
        console.error('[Mic Passthrough] Failed:', err)
        setMicPassthroughActive(false)
      }
    }

    startPassthrough()
    return () => { cancelled = true; stopMicPassthrough() }
  }, [micDeviceId, cableInputDeviceId, voiceEffects.enabled, voiceEffects.testMode]) // eslint-disable-line react-hooks/exhaustive-deps

  function stopMicPassthrough() {
    // Stop direct path audio elements
    if (micAudioRef.current) {
      micAudioRef.current.pause()
      micAudioRef.current.srcObject = null
      micAudioRef.current = null
    }

    // Stop effects path audio elements
    if (fxCableAudioRef.current) {
      fxCableAudioRef.current.pause()
      fxCableAudioRef.current.srcObject = null
      fxCableAudioRef.current = null
    }
    if (fxMonitorAudioRef.current) {
      fxMonitorAudioRef.current.pause()
      fxMonitorAudioRef.current.srcObject = null
      fxMonitorAudioRef.current = null
    }

    // Close AudioContext
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }

    // Stop stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }

    // Reset effect node refs
    robotOscRef.current = null
    reverbNodeRef.current = null
    gateNodeRef.current = null
    analyserRef.current = null

    setMicPassthroughActive(false)
  }

  // ── Voice Effects: Live parameter updates ──
  useEffect(() => {
    if (robotOscRef.current) {
      robotOscRef.current.frequency.value = voiceEffects.robot.frequency
    }
  }, [voiceEffects.robot.frequency])

  useEffect(() => {
    if (reverbNodeRef.current && audioCtxRef.current) {
      reverbNodeRef.current.buffer = buildImpulseResponse(audioCtxRef.current, voiceEffects.reverb.decay)
    }
  }, [voiceEffects.reverb.decay])

  useEffect(() => {
    noiseThreshRef.current = voiceEffects.noiseGate.threshold
  }, [voiceEffects.noiseGate.threshold])

  useEffect(() => {
    if (fxMonitorAudioRef.current) {
      fxMonitorAudioRef.current.volume = virtualVolume
    }
  }, [virtualVolume])

  // ── Ctrl+Shift+D debug panel toggle ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setShowDebug(v => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Dual-output audio playback ─────────────────────────────────────────────
  const playSound = useCallback(async (id: string) => {
    const sound = useSoundsStore.getState().sounds.find(s => s.id === id)
    if (!sound) return

    stopCurrentRef.current?.()
    stopCurrentRef.current = null
    setPlayingId(null)

    try {
      const audioElements: HTMLAudioElement[] = []
      const playPromises: Promise<void>[] = []

      // Helper to create and configure an audio element
      const createOutput = async (deviceId: string | null, volume: number) => {
        const audio = new Audio(toFileUrl(sound.filePath))
        audio.volume = volume

        if (deviceId) {
          try {
            const setSink = (audio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId
            if (setSink) await setSink.call(audio, deviceId)
          } catch (err) {
            console.warn('[Honkpad] setSinkId failed for device:', deviceId, err)
            // Fall through — play through default device instead of failing
          }
        }

        audioElements.push(audio)
        return audio
      }

      // Output 1: CABLE Input (what others hear)
      if (cableInputDeviceId) {
        const cableAudio = await createOutput(cableInputDeviceId, virtualVolume)
        playPromises.push(cableAudio.play())
      }

      // Output 2: Monitor (what user hears locally)
      const monitorAudio = await createOutput(monitorDeviceId, monitorVolume)
      playPromises.push(monitorAudio.play())

      // Start both simultaneously to minimize drift
      await Promise.all(playPromises)

      let done = false
      // Track "ended" on the monitor audio (primary tracking element)
      const primaryAudio = audioElements[audioElements.length - 1]

      // Store reference for progress tracking
      playbackAudioRef.current = primaryAudio
      setPlaybackProgress(0)

      primaryAudio.addEventListener('ended', () => {
        if (!done) {
          done = true
          setPlayingId(null)
          setPlaybackProgress(0)
          playbackAudioRef.current = null
          stopCurrentRef.current = null
        }
      })

      setPlayingId(id)
      stopCurrentRef.current = () => {
        if (!done) {
          done = true
          for (const a of audioElements) {
            a.pause()
            a.currentTime = 0
          }
          setPlayingId(null)
          setPlaybackProgress(0)
          playbackAudioRef.current = null
        }
      }
    } catch (err) {
      console.error('[Honkpad] Play failed:', err, sound.filePath)
      setPlayingId(null)
    }
  }, [cableInputDeviceId, monitorDeviceId, virtualVolume, monitorVolume])

  const stopSound = useCallback(() => {
    stopCurrentRef.current?.()
    stopCurrentRef.current = null
    setPlayingId(null)
    setPlaybackProgress(0)
    playbackAudioRef.current = null
  }, [])

  // ── Play a random sound from a group ──────────────────────────────────────
  const playGroupRandom = useCallback((groupId: string) => {
    const { sounds: s, groups: g } = useSoundsStore.getState()
    const group = g.find(gr => gr.id === groupId)
    if (!group || group.soundIds.length === 0) return
    const pool = s.filter(sound => group.soundIds.includes(sound.id))
    if (pool.length === 0) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    playSound(pick.id)
  }, [playSound])

  useEffect(() => {
    const unsub = window.electronAPI.onPlaySound((id) => playSound(id))
    return () => { if (unsub) unsub() }
  }, [playSound])

  // Sync playing state to tray tooltip
  useEffect(() => {
    window.electronAPI.updateTrayStatus(playingId !== null)
  }, [playingId])

  // Stop all sounds from tray / global hotkey
  useEffect(() => {
    const unsub = window.electronAPI.onStopAllSounds(() => stopSound())
    return () => { if (unsub) unsub() }
  }, [stopSound])

  // Load persisted stop hotkey
  useEffect(() => {
    window.electronAPI.getStopHotkey().then(setStopHotkeyState)
  }, [])

  // Capture keys for stop hotkey reassignment
  useEffect(() => {
    if (!capturingStopHotkey) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.key === 'Escape') { setCapturingStopHotkey(false); setCapturedStopKeys([]); return }
      const held = new Set<string>()
      if (e.ctrlKey) held.add('Control')
      if (e.altKey) held.add('Alt')
      if (e.shiftKey) held.add('Shift')
      if (e.metaKey) held.add('Meta')
      const mods = ['Control', 'Alt', 'Shift', 'Meta']
      if (!mods.includes(e.key)) held.add(e.key)
      setCapturedStopKeys([...held])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [capturingStopHotkey])

  const handleConfirmStopHotkey = async () => {
    if (capturedStopKeys.length === 0) return
    const hotkey = formatHotkeyElectron(capturedStopKeys)
    await window.electronAPI.setStopHotkey(hotkey)
    setStopHotkeyState(hotkey)
    setCapturingStopHotkey(false)
    setCapturedStopKeys([])
  }

  const handleRemoveStopHotkey = async () => {
    await window.electronAPI.setStopHotkey('')
    setStopHotkeyState('')
  }

  const handleImport = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths.length > 0) addSounds(paths)
  }

  const handleHotkeyConfirm = async (hotkey: string | null) => {
    if (modalSoundId) await setHotkey(modalSoundId, hotkey)
    setModalSoundId(null)
  }

  const handleCreateGroup = async () => {
    const group = await addGroup('')
    setEditGroupId(group.id)
    setTab('groups')
  }

  const handleVBCableComplete = async () => {
    setShowVBCableSetup(false)
    // Refresh status after setup
    try {
      const status = await window.electronAPI.checkVBCable()
      setVbcableStatus(status)
      const conflictResult = await window.electronAPI.detectConflicts()
      setConflict(conflictResult)
    } catch { /* continue */ }
  }

  const modalSound = sounds.find(s => s.id === modalSoundId) ?? null
  const editGroup = groups.find(g => g.id === editGroupId) ?? null
  const hasContent = sounds.length > 0 || groups.length > 0
  const hasCableInput = outputs.some(d => d.isCableInput)

  return (
    <>
      {/* VB-Cable Setup Overlay (first launch) */}
      {showVBCableSetup && (
        <VBCableSetup onComplete={handleVBCableComplete} />
      )}

      {/* Titlebar */}
      <div className="titlebar">
        <div className="titlebar-drag">
          <HonkpadLogo className="titlebar-logo" />
        </div>
        <div className="titlebar-controls">
          <button onClick={() => window.electronAPI.minimizeWindow()} title={t('window.minimize')}><Minus size={12} /></button>
          <button onClick={() => window.electronAPI.maximizeWindow()} title={t('window.maximize')}><Square size={11} /></button>
          <button onClick={() => window.electronAPI.closeWindow()} className="close-btn" title={t('window.close')}><X size={12} /></button>
        </div>
      </div>

      {/* Conflict Warning Banner */}
      {conflict?.hasConflict && !conflictDismissed && (
        <ConflictWarning
          conflict={conflict}
          onDismiss={() => setConflictDismissed(true)}
        />
      )}

      {/* Main */}
      <main className="main">
        {loaded && (
          <div className="toolbar">
            <div className="tabs">
              <button
                className={`tab-btn ${tab === 'sounds' ? 'active' : ''}`}
                onClick={() => setTab('sounds')}
              >
                <Music2 size={13} /> {t('tab.sounds')}
                {sounds.length > 0 && <span className="count">{sounds.length}</span>}
              </button>
              <button
                className={`tab-btn ${tab === 'groups' ? 'active' : ''}`}
                onClick={() => setTab('groups')}
              >
                <Layers size={13} /> {t('tab.groups')}
                {groups.length > 0 && <span className="count">{groups.length}</span>}
              </button>
              <button
                className={`tab-btn ${tab === 'settings' ? 'active' : ''}`}
                onClick={() => setTab('settings')}
              >
                <Settings size={13} /> {t('tab.settings')}
              </button>
              <button
                className={`tab-btn ${tab === 'voiceEffects' ? 'active' : ''}`}
                onClick={() => setTab('voiceEffects')}
              >
                <Mic size={13} /> {t('tab.voiceEffects')}
              </button>
            </div>

            <div className="toolbar-right">
              <button
                className={`stop-all-btn ${playingId ? 'playing' : ''}`}
                onClick={stopSound}
                title={`${t('button.stopAll')}${stopHotkey ? ` (${stopHotkey})` : ''}`}
                disabled={!playingId}
              >
                <StopCircle size={15} />
              </button>
              {tab === 'sounds' && (
                <button className="btn-primary" onClick={() => setShowImportModal(true)}>
                  <FolderOpen size={15} /> {t('button.importAudios')}
                </button>
              )}
              {tab === 'groups' && (
                <button className="btn-primary" onClick={handleCreateGroup}>
                  <Plus size={15} /> {t('button.newGroup')}
                </button>
              )}
            </div>
          </div>
        )}

        {!loaded && <div className="loading"><div className="spinner" /></div>}

        {loaded && !hasContent && tab !== 'settings' && <EmptyState onImport={() => setShowImportModal(true)} />}

        {/* Sounds tab */}
        {loaded && tab === 'sounds' && sounds.length > 0 && (
          <div className="search-box sounds-search">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder={t('search.placeholder')}
              value={soundSearch}
              onChange={e => setSoundSearch(e.target.value)}
            />
          </div>
        )}
        {loaded && tab === 'sounds' && sounds.length > 0 && (() => {
          const filtered = sounds.filter(s => s.name.toLowerCase().includes(soundSearch.toLowerCase()))
          return filtered.length > 0
            ? (
              <div className="sound-grid">
                {filtered.map(sound => (
                  <SoundCard
                    key={sound.id}
                    sound={sound}
                    onPlay={playSound}
                    onStop={stopSound}
                    onRemove={removeSound}
                    onHotkeyClick={id => setModalSoundId(id)}
                    isPlaying={playingId === sound.id}
                    progress={playingId === sound.id ? playbackProgress : 0}
                  />
                ))}
              </div>
            )
            : (
              <div className="tab-empty">
                <p>{t('sounds.searchEmpty', { query: soundSearch })}</p>
              </div>
            )
        })()}

        {loaded && tab === 'sounds' && sounds.length === 0 && hasContent && (
          <div className="tab-empty">
            <p>{t('sound.empty')}</p>
            <button className="btn-primary" onClick={() => setShowImportModal(true)}>
              <FolderOpen size={15} /> {t('button.importAudios')}
            </button>
          </div>
        )}

        {/* Groups tab */}
        {loaded && tab === 'groups' && groups.length > 0 && (
          <div className="sound-grid">
            {groups.map(group => (
              <GroupCard
                key={group.id}
                group={group}
                sounds={sounds}
                onPlayRandom={playGroupRandom}
                onEdit={id => setEditGroupId(id)}
                onRemove={removeGroup}
                isPlaying={group.soundIds.includes(playingId ?? '')}
              />
            ))}
          </div>
        )}

        {loaded && tab === 'groups' && groups.length === 0 && hasContent && (
          <div className="tab-empty">
            <p>{t('group.empty')}</p>
            <button className="btn-primary" onClick={handleCreateGroup}>
              <Plus size={15} /> {t('button.newGroup')}
            </button>
          </div>
        )}

        {/* Settings tab */}
        {loaded && tab === 'settings' && (
          <div className="settings-page">
            <div className="settings-section">
              <div className="settings-section-title">
                <Cable size={14} /> {t('audio.routing')}
              </div>
              <div className="dual-device-bar">
                {/* Mic Input */}
                <div className="dual-device-channel">
                  <div className="channel-header">
                    {micPassthroughActive ? <Mic size={13} /> : <MicOff size={13} />}
                    <span>{t('audio.yourMic')}</span>
                    {micPassthroughActive && <span className="badge-sm badge-active">{t('audio.cableAuto')}</span>}
                  </div>
                  <div className="device-selector" onClick={e => e.stopPropagation()}>
                    <MicPicker
                      devices={inputs}
                      selectedId={micDeviceId}
                      onSelect={setMicDeviceId}
                    />
                  </div>
                  {!micDeviceId && (
                    <div className="channel-hint">
                      {t('audio.micLabel')}
                    </div>
                  )}
                </div>

                <div className="dual-device-divider" />

                {/* Virtual Output (CABLE Input - Fixed) */}
                <div className="dual-device-channel">
                  <div className="channel-header">
                    <Cable size={13} />
                    <span>{t('audio.cable')}</span>
                    {hasCableInput && <span className="badge-sm">{t('audio.cableAuto')}</span>}
                  </div>
                  <div className="device-btn cable-fixed" title={t('audio.cableSetup')}>
                    <Cable size={13} />
                    <span className="device-label">
                      {outputs.find(d => d.deviceId === cableInputDeviceId)?.label || 'CABLE Input'}
                    </span>
                  </div>
                  <VolumeSlider value={virtualVolume} onChange={setVirtualVolume} label={t('audio.volumeVirtual')} />
                </div>

                <div className="dual-device-divider" />

                {/* Monitor Output */}
                <div className="dual-device-channel">
                  <div className="channel-header">
                    <Monitor size={13} />
                    <span>{t('audio.monitor')}</span>
                  </div>
                  <DevicePicker
                    devices={outputs}
                    selectedId={monitorDeviceId}
                    onSelect={setMonitorDeviceId}
                    label={t('audio.monitorLabel')}
                    icon={<Volume2 size={13} />}
                  />
                  <VolumeSlider value={monitorVolume} onChange={setMonitorVolume} label={t('audio.volumeMonitor')} />
                </div>
              </div>

              <button className="btn-secondary reconfigure-btn" onClick={() => {
                // Clear all stored device IDs and force re-detection
                localStorage.removeItem('sdb_cableInput')
                localStorage.removeItem('sdb_monitor')
                localStorage.removeItem('sdb_mic')
                setCableInputDeviceId(null)
                setMonitorDeviceId(null)
                setMicDeviceId(null)
                // Trigger device re-enumeration via devicechange event
                navigator.mediaDevices.enumerateDevices().then(all => {
                  const outputDevices = all.filter(d => d.kind === 'audiooutput').map(d => ({
                    deviceId: d.deviceId,
                    label: d.label || `Dispositivo (${d.deviceId.slice(0, 8)}…)`,
                    isCableInput: isCableInputDevice(d.label),
                  }))
                  setOutputs(outputDevices)
                  const inputDevices = all
                    .filter(d => d.kind === 'audioinput')
                    .filter(d => !d.label.toLowerCase().includes('cable output'))
                    .map(d => ({ deviceId: d.deviceId, label: d.label || `Microfone (${d.deviceId.slice(0, 8)}…)` }))
                  setInputs(inputDevices)
                  const cable = outputDevices.find(d => d.isCableInput)
                  if (cable) setCableInputDeviceId(cable.deviceId)
                  const monitor = outputDevices.find(d => !d.isCableInput && d.deviceId !== 'default' && d.deviceId !== 'communications')
                  if (monitor) setMonitorDeviceId(monitor.deviceId)
                  console.log('[Audio] Reconfigured — CABLE:', cable?.label, '| Monitor:', monitor?.label)
                })
              }}>
                <RefreshCw size={14} /> {t('audio.reconfigure')}
              </button>

              <button className="btn-secondary reconfigure-btn" onClick={() => setShowVBCableSetup(true)}>
                <Download size={14} /> {t('audio.reinstallVBCable')}
              </button>
            </div>

            {/* Stop All Hotkey Settings */}
            <div className="settings-section">
              <div className="settings-section-title">
                <Keyboard size={14} /> {t('hotkey.stopAll')}
              </div>
              <div className="hotkey-setting">
                <label className="hotkey-label">{t('hotkey.label')}</label>
                <div className="hotkey-row">
                  <span className={`hotkey-badge ${stopHotkey ? 'assigned' : 'unassigned'}`}>
                    <Keyboard size={12} />
                    <span>{stopHotkey || t('hotkey.unassigned')}</span>
                  </span>
                  <button
                    className="btn-secondary"
                    onClick={() => setCapturingStopHotkey(true)}
                  >
                    {stopHotkey ? t('button.change') : t('button.setHotkey')}
                  </button>
                  {stopHotkey && (
                    <button className="btn-ghost" onClick={handleRemoveStopHotkey}>
                      {t('button.remove')}
                    </button>
                  )}
                </div>

                {capturingStopHotkey && (
                  <div className="hotkey-capture-container">
                    <div className={`hotkey-capture-area ${capturingStopHotkey ? 'listening' : ''} ${capturedStopKeys.length > 0 ? 'captured' : ''}`}>
                      {capturingStopHotkey && <div className="pulse-ring" />}
                      {capturedStopKeys.length > 0
                        ? <span className="captured-key">{formatHotkeyDisplay(capturedStopKeys)}</span>
                        : <span className="capture-hint">{t('hotkey.capture')}</span>
                      }
                    </div>
                    <div className="hotkey-actions">
                      <button className="btn-ghost" onClick={() => { setCapturingStopHotkey(false); setCapturedStopKeys([]) }}>
                        {t('button.cancel')}
                      </button>
                      <button className="btn-primary" onClick={handleConfirmStopHotkey} disabled={capturedStopKeys.length === 0}>
                        {t('button.confirm')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Language Settings */}
            <div className="settings-section">
              <div className="settings-section-title">
                <Music2 size={14} /> Language
              </div>
              <div className="language-selector">
                <label className="language-label">Select language</label>
                <select
                  className="language-select"
                  defaultValue={localStorage.getItem('sdb_language') || 'pt-BR'}
                  onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español (España)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {loaded && tab === 'voiceEffects' && (
          <VoiceEffectsPage
            voiceEffects={voiceEffects}
            onUpdate={setVoiceEffects}
            micPassthroughActive={micPassthroughActive}
            micDeviceId={micDeviceId}
            analyserRef={analyserRef}
          />
        )}
      </main>

      {/* Hotkey modal for individual sounds */}
      {modalSoundId && modalSound && (
        <HotkeyModal
          currentHotkey={modalSound.hotkey}
          soundName={modalSound.name}
          onConfirm={handleHotkeyConfirm}
          onClose={() => setModalSoundId(null)}
        />
      )}

      {/* Group edit modal */}
      {editGroupId && editGroup && (
        <GroupModal
          group={editGroup}
          allSounds={sounds}
          onSave={async (updated: SoundGroup) => {
            await updateGroup(updated)
            setEditGroupId(null)
          }}
          onClose={() => setEditGroupId(null)}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          onFileImport={handleImport}
          addSounds={addSounds}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Debug Panel */}
      <DebugPanel
        visible={showDebug}
        onClose={() => setShowDebug(false)}
        cableInputDeviceId={cableInputDeviceId}
        monitorDeviceId={monitorDeviceId}
        micDeviceId={micDeviceId}
        micPassthroughActive={micPassthroughActive}
        virtualVolume={virtualVolume}
        monitorVolume={monitorVolume}
        vbcableStatus={vbcableStatus}
        conflict={conflict}
      />
    </>
  )
}
