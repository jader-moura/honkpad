import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSoundsStore } from './hooks/useSounds'
import { SoundCard } from './components/SoundCard'
import { GroupCard } from './components/GroupCard'
import { GroupModal } from './components/GroupModal'
import { HotkeyModal } from './components/HotkeyModal'
import { EmptyState } from './components/EmptyState'
import { SoundGroup } from './types/global'
import {
  Minus, Square, X, Music2, FolderOpen,
  Volume2, ChevronDown, Info, CheckCircle2, Plus, Layers
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
            Para que outros ouçam na call: selecione <em>CABLE Input</em> aqui e <em>CABLE Output</em> como mic.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

type Tab = 'sounds' | 'groups'

export default function App() {
  const { sounds, groups, loaded, load, addSounds, removeSound, setHotkey,
    addGroup, removeGroup, updateGroup } = useSoundsStore()

  const [tab, setTab] = useState<Tab>('sounds')
  const [modalSoundId, setModalSoundId] = useState<string | null>(null)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [showStereoGuide, setShowStereoGuide] = useState(false)
  const [outputDeviceId, setOutputDeviceId] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<AudioDevice[]>([])

  const stopCurrentRef = useRef<(() => void) | null>(null)

  useEffect(() => { load() }, [load])

  useEffect(() => {
    async function loadDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => { })
        const all = await navigator.mediaDevices.enumerateDevices()
        setOutputs(
          all.filter(d => d.kind === 'audiooutput').map(d => ({
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

  // ── Centralized audio playback ─────────────────────────────────────────────
  const playSound = useCallback(async (id: string) => {
    const sound = useSoundsStore.getState().sounds.find(s => s.id === id)
    if (!sound) return

    stopCurrentRef.current?.()
    stopCurrentRef.current = null
    setPlayingId(null)

    try {
      const audio = new Audio(toFileUrl(sound.filePath))
      if (outputDeviceId) {
        const setSink = (audio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId
        if (setSink) await setSink.call(audio, outputDeviceId).catch(() => { })
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

  const handleImport = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths.length > 0) addSounds(paths)
  }

  const handleHotkeyConfirm = async (hotkey: string | null) => {
    if (modalSoundId) await setHotkey(modalSoundId, hotkey)
    setModalSoundId(null)
  }

  const handleCreateGroup = async () => {
    const group = await addGroup('Novo Grupo')
    setEditGroupId(group.id)
    setTab('groups')
  }

  const modalSound = sounds.find(s => s.id === modalSoundId) ?? null
  const editGroup = groups.find(g => g.id === editGroupId) ?? null
  const hasStereoMix = outputs.some(d => d.isStereoMix)
  const hasContent = sounds.length > 0 || groups.length > 0

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

      {/* Stereo Mix guide */}
      {showStereoGuide && (
        <div className="stereo-guide" onClick={() => setShowStereoGuide(false)}>
          <div className="stereo-guide-box" onClick={e => e.stopPropagation()}>
            <button className="stereo-guide-close" onClick={() => setShowStereoGuide(false)}><X size={14} /></button>
            <h3>Usar como microfone — em qualquer app</h3>
            <p className="guide-intro">
              O soundboard reproduz sons em um dispositivo de saída. Para que outros ouçam, você precisa que esse dispositivo apareça como <strong>microfone</strong>.
            </p>
            <div className="guide-option">
              <div className="guide-option-title">Opção 1 — Stereo Mix (Windows nativo)</div>
              <ol className="guide-steps">
                <li><strong>Win + R</strong> → <em>mmsys.cpl</em> → aba <strong>Gravação</strong></li>
                <li>Botão direito em área vazia → <em>"Mostrar dispositivos desativados"</em></li>
                <li>Botão direito em <strong>Stereo Mix</strong> → <em>Habilitar</em> → <em>"Definir como padrão"</em></li>
                <li>No jogo/Discord → mic = <strong>Stereo Mix</strong>, Soundboard → saída padrão</li>
              </ol>
            </div>
            <div className="guide-option">
              <div className="guide-option-title">Opção 2 — VB-CABLE (recomendado para USB)</div>
              <ol className="guide-steps">
                <li>Instalar <strong>VB-CABLE</strong> em <em>vb-audio.com/Cable</em> (gratuito)</li>
                <li>Soundboard → Saída = <strong>CABLE Input</strong></li>
                <li>No jogo/Discord → mic = <strong>CABLE Output</strong></li>
                <li>Opcional: HyperX → mmsys.cpl → Properties → Ouvir → reproduzir pelo CABLE Input</li>
              </ol>
            </div>
            <div className="guide-note">
              {hasStereoMix
                ? <><CheckCircle2 size={14} className="guide-check" /> Stereo Mix detectado!</>
                : <><Info size={14} /> Stereo Mix não encontrado. Use VB-CABLE para headsets USB.</>
              }
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="main">
        {loaded && hasContent && (
          <div className="toolbar">
            <div className="tabs">
              <button
                className={`tab-btn ${tab === 'sounds' ? 'active' : ''}`}
                onClick={() => setTab('sounds')}
              >
                <Music2 size={13} /> Sons
                {sounds.length > 0 && <span className="count">{sounds.length}</span>}
              </button>
              <button
                className={`tab-btn ${tab === 'groups' ? 'active' : ''}`}
                onClick={() => setTab('groups')}
              >
                <Layers size={13} /> Grupos
                {groups.length > 0 && <span className="count">{groups.length}</span>}
              </button>
            </div>

            <div className="toolbar-right">
              <button
                className={`stereo-mix-btn ${hasStereoMix ? 'found' : ''}`}
                onClick={() => setShowStereoGuide(true)}
              >
                {hasStereoMix ? <CheckCircle2 size={13} /> : <Info size={13} />}
                Como usar como mic
              </button>

              <DevicePicker devices={outputs} selectedId={outputDeviceId} onSelect={setOutputDeviceId} />

              {tab === 'sounds' && (
                <button className="btn-primary" onClick={handleImport}>
                  <FolderOpen size={15} /> Importar Áudios
                </button>
              )}
              {tab === 'groups' && (
                <button className="btn-primary" onClick={handleCreateGroup}>
                  <Plus size={15} /> Novo Grupo
                </button>
              )}
            </div>
          </div>
        )}

        {!loaded && <div className="loading"><div className="spinner" /></div>}

        {loaded && !hasContent && <EmptyState onImport={handleImport} />}

        {/* Sounds tab */}
        {loaded && tab === 'sounds' && sounds.length > 0 && (
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

        {loaded && tab === 'sounds' && sounds.length === 0 && hasContent && (
          <div className="tab-empty">
            <p>Nenhum som importado.</p>
            <button className="btn-primary" onClick={handleImport}>
              <FolderOpen size={15} /> Importar Áudios
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
            <p>Nenhum grupo criado ainda.</p>
            <button className="btn-primary" onClick={handleCreateGroup}>
              <Plus size={15} /> Novo Grupo
            </button>
          </div>
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
    </>
  )
}
