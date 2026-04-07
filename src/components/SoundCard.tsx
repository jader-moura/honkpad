import React from 'react'
import { Play, Square, Keyboard, Trash2, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SoundEntry } from '../types/global'
import { WaveformBar } from './WaveformBar'

interface SoundCardProps {
  sound: SoundEntry
  onPlay: (id: string) => void
  onStop: () => void
  onRemove: (id: string) => void
  onHotkeyClick: (id: string) => void
  isPlaying: boolean
  progress?: number  // 0-1 playback progress
}

export function SoundCard({
  sound,
  onPlay,
  onStop,
  onRemove,
  onHotkeyClick,
  isPlaying,
  progress = 0,
}: SoundCardProps) {
  const { t } = useTranslation()
  return (
    <div className={`sound-card ${isPlaying ? 'playing' : ''}`}>
      {isPlaying && <div className="playing-bar" />}

      <div className="sound-card-name" title={sound.name}>
        <Volume2 size={14} className="sound-icon" />
        <span>{sound.name}</span>
      </div>

      {/* Waveform visualization */}
      {(sound.waveform || sound.duration) && (
        <div className="sound-card-waveform">
          <WaveformBar
            waveform={sound.waveform}
            duration={sound.duration}
            progress={isPlaying ? progress : 0}
            isPlaying={isPlaying}
          />
        </div>
      )}

      <button
        className={`play-btn ${isPlaying ? 'playing' : ''}`}
        onClick={() => isPlaying ? onStop() : onPlay(sound.id)}
        title={isPlaying ? t('sound.stop') : t('sound.play')}
      >
        {isPlaying
          ? <Square size={20} fill="currentColor" />
          : <Play size={22} fill="currentColor" />
        }
      </button>

      <div className="sound-card-footer">
        <button
          className={`hotkey-badge ${sound.hotkey ? 'assigned' : 'unassigned'}`}
          onClick={() => onHotkeyClick(sound.id)}
          title={t('sound.configureHotkey')}
        >
          <Keyboard size={12} />
          <span>{sound.hotkey ?? t('hotkey.noHotkey')}</span>
        </button>

        <button className="remove-btn" onClick={() => onRemove(sound.id)} title={t('sound.remove')}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
