import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSoundsStore } from './hooks/useSounds'
import { SoundCard } from './components/SoundCard'
import { HotkeyModal } from './components/HotkeyModal'
import { EmptyState } from './components/EmptyState'
import {
  Minus, Square, X, Music2, FolderOpen,
  Volume2, ChevronDown, Info, CheckCircle2
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioDevice {
  deviceId: string
  label: string
  isStereoMix: boolean
}

function isStereoMixDevice(label: string): boolean {
  const l = label.toLowerCase()
  return l.includes('stereo mix') || l.includes('what u hear') ||
    l.includes('wave out mix') || l.includes('loopback')
}

function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

// ─── Device Picker ────────────────────────────────────────────────────────────

interface DevicePickerProps {
  devices: AudioDevice[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function DevicePicker({ devices, selectedId, onSelect }: DevicePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = devices.find(d => d.deviceId === selectedId)

  return (
    <div className="device-selector" onClick={e => e.stopPropagation()}>
      <button
        className={`device-btn ${open ? 'open' : ''} ${selectedId ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Selecionar saída de áudio"
      >
        <Volume2 size={13} />
        <span className="device-label">{selected?.label ?? 'Padrão do sistema'}</span>
        <ChevronDown size={12} className={`chevron ${open ? 'rotated' : ''}`} />
      </button>

      {open && (
        <div className="device-menu">
          <div className="device-menu-header">Saída de áudio</div>

          <button
            className={`device-menu-item ${!selectedId ? 'active' : ''}`}
            onClick={() => { onSelect(null); setOpen(false) }}
          >
            Padrão do sistema
          </button>

          {devices.map(d => (
            <button
              key={d.deviceId}
              className={`device-menu-item ${d.deviceId === selectedId ? 'active' : ''} ${d.isStereoMix ? 'stereo-mix' : ''}`}
              onClick={() => { onSelect(d.deviceId); setOpen(false) }}
            >
              {d.isStereoMix && <span className="badge-sm">Nativo</span>}
              {d.label}
            </button>
          ))}

          <div className="device-menu-hint">
            Para que outros ouçam na call: selecione <em>CABLE Input</em> aqui e <em>CABLE Output</em> como mic no Discord/jogo.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { sounds, loaded, load, addSounds, removeSound, setHotkey } = useSoundsStore()

  const [modalSoundId, setModalSoundId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [showStereoGuide, setShowStereoGuide] = useState(false)
  const [outputDeviceId, setOutputDeviceId] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<AudioDevice[]>([])

  // Shared AudioContext routed to the selected output device
  const stopCurrentRef = useRef<(() => void) | null>(null)

  useEffect(() => { load() }, [load])

  // Enumerate output devices only
  useEffect(() => {
    async function loadDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {})
        const all = await navigator.mediaDevices.enumerateDevices()
        setOutputs(
          all
            .filter(d => d.kind === 'audiooutput')
            .map(d => ({
              deviceId: d.deviceId,
              label: d.label || `Dispositivo (${d.deviceId.slice(0, 8)}…)`,
              isStereoMix: isStereoMixDevice(d.label),
            }))
        )
      } catch { /* permissions denied */ }
    }
    loadDevices()
    navigator.mediaDevices.addEventListener('devicechange', loadDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
  }, [])

  // ── Play sound via HTMLAudioElement + setSinkId ──────────────────────────────
  // HTMLAudioElement.setSinkId has better Electron support than AudioContext.setSinkId
  const playSound = useCallback(async (id: string) => {
    const sound = useSoundsStore.getState().sounds.find(s => s.id === id)
    if (!sound) return

    stopCurrentRef.current?.()
    stopCurrentRef.current = null
    setPlayingId(null)

    try {
      const url = toFileUrl(sound.filePath)
      const audio = new Audio(url)

      // Route to selected output device if one is chosen
      if (outputDeviceId) {
        const setSink = (audio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId
        if (setSink) {
          await setSink.call(audio, outputDeviceId)
          console.log('[Soundboard] Routing to device:', outputDeviceId)
        } else {
          console.warn('[Soundboard] setSinkId not available in this Electron version')
        }
      }

      let done = false
      audio.addEventListener('ended', () => {
        if (!done) { done = true; setPlayingId(null); stopCurrentRef.current = null }
      })

      setPlayingId(id)
      await audio.play()
      stopCurrentRef.current = () => {
        if (!done) { done = true; audio.pause(); audio.currentTime = 0; setPlayingId(null) }
      }
    } catch (err) {
      console.error('[Soundboard] Play failed:', err, sound.filePath)
      setPlayingId(null)
    }
  }, [outputDeviceId])


  const stopSound = useCallback(() => {
    stopCurrentRef.current?.()
    stopCurrentRef.current = null
    setPlayingId(null)
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI.onPlaySound((id) => playSound(id))
    return () => { if (unsub) unsub() }
  }, [playSound])

  const handleImport = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths.length > 0) addSounds(paths)
  }

  const handleHotkeyConfirm = async (hotkey: string | null) => {
    if (modalSoundId) await setHotkey(modalSoundId, hotkey)
    setModalSoundId(null)
  }

  const modalSound = sounds.find(s => s.id === modalSoundId) ?? null
  const hasStereoMix = outputs.some(d => d.isStereoMix)

  return (
    <>
      {/* Titlebar */}
      <div className="titlebar">
        <div className="titlebar-drag">
          <Music2 size={16} className="titlebar-icon" />
          <span className="titlebar-title">Soundboard</span>
        </div>
        <div className="titlebar-controls">
          <button onClick={() => window.electronAPI.minimizeWindow()} title="Minimizar"><Minus size={12} /></button>
          <button onClick={() => window.electronAPI.maximizeWindow()} title="Maximizar"><Square size={11} /></button>
          <button onClick={() => window.electronAPI.closeWindow()} className="close-btn" title="Fechar"><X size={12} /></button>
        </div>
      </div>

      {/* Stereo Mix / VB-CABLE guide */}
      {showStereoGuide && (
        <div className="stereo-guide" onClick={() => setShowStereoGuide(false)}>
          <div className="stereo-guide-box" onClick={e => e.stopPropagation()}>
            <button className="stereo-guide-close" onClick={() => setShowStereoGuide(false)}><X size={14} /></button>
            <h3>Usar como microfone — em qualquer app</h3>
            <p className="guide-intro">
              O soundboard reproduz sons em um dispositivo de saída. Para que outros em calls ou jogos ouçam, você precisa que esse dispositivo apareça como <strong>microfone</strong>. Duas opções:
            </p>

            <div className="guide-option">
              <div className="guide-option-title">Opção 1 — Stereo Mix (Windows nativo, grátis)</div>
              <ol className="guide-steps">
                <li><strong>Win + R</strong> → digitar <em>mmsys.cpl</em> → Enter</li>
                <li>Aba <strong>Gravação</strong> → botão direito em área vazia → <em>"Mostrar dispositivos desativados"</em></li>
                <li>Botão direito em <strong>Stereo Mix</strong> → <em>Habilitar</em> → <em>"Definir como padrão"</em></li>
                <li>No Discord/jogo → microfone = <strong>Stereo Mix</strong></li>
                <li>No Soundboard → Saída de áudio = <strong>Padrão do sistema</strong></li>
              </ol>
            </div>

            <div className="guide-option">
              <div className="guide-option-title">Opção 2 — VB-CABLE (mais confiável, especialmente USB)</div>
              <ol className="guide-steps">
                <li>Instalar <strong>VB-CABLE</strong> em <em>vb-audio.com/Cable</em> (gratuito, 1 min)</li>
                <li>No Soundboard → Saída de áudio = <strong>CABLE Input (VB-Audio)</strong></li>
                <li>No Discord/jogo → microfone = <strong>CABLE Output (VB-Audio)</strong></li>
                <li>Para ouvir sua própria voz também: abra as Propriedades do seu mic no Windows → aba <em>Ouvir</em> → ativar <em>"Ouvir este dispositivo"</em> pela saída CABLE</li>
              </ol>
            </div>

            <div className="guide-note">
              {hasStereoMix
                ? <><CheckCircle2 size={14} className="guide-check" /> Stereo Mix detectado! Defina-o como padrão de gravação e selecione-o no Discord.</>
                : <><Info size={14} /> Stereo Mix não encontrado (comum com headsets USB). Use a Opção 2 — VB-CABLE.</>
              }
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="main" onClick={() => {}}>
        {loaded && sounds.length > 0 && (
          <div className="toolbar">
            <h1 className="toolbar-heading">
              Meus Sons <span className="count">{sounds.length}</span>
            </h1>
            <div className="toolbar-right">
              <button
                className={`stereo-mix-btn ${hasStereoMix ? 'found' : ''}`}
                onClick={() => setShowStereoGuide(true)}
                title="Como usar como microfone"
              >
                {hasStereoMix ? <CheckCircle2 size={13} /> : <Info size={13} />}
                Como usar como mic
              </button>

              <DevicePicker
                devices={outputs}
                selectedId={outputDeviceId}
                onSelect={setOutputDeviceId}
              />

              <button className="btn-primary" onClick={handleImport}>
                <FolderOpen size={15} /> Importar Áudios
              </button>
            </div>
          </div>
        )}

        {!loaded && <div className="loading"><div className="spinner" /></div>}
        {loaded && sounds.length === 0 && <EmptyState onImport={handleImport} />}

        {loaded && sounds.length > 0 && (
          <div className="sound-grid">
            {sounds.map(sound => (
              <SoundCard
                key={sound.id}
                sound={sound}
                onPlay={playSound}
                onStop={stopSound}
                onRemove={removeSound}
                onHotkeyClick={id => setModalSoundId(id)}
                isPlaying={playingId === sound.id}
              />
            ))}
          </div>
        )}
      </main>

      {modalSoundId && modalSound && (
        <HotkeyModal
          currentHotkey={modalSound.hotkey}
          soundName={modalSound.name}
          onConfirm={handleHotkeyConfirm}
          onClose={() => setModalSoundId(null)}
        />
      )}
    </>
  )
}
