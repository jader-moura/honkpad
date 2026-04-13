import React from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, MicOff } from 'lucide-react'
import type { VoiceEffectsSettings } from '../App'

interface VoiceEffectsPageProps {
  voiceEffects: VoiceEffectsSettings
  onUpdate: (settings: VoiceEffectsSettings) => void
  micPassthroughActive: boolean
  micDeviceId: string | null
  analyserRef: React.MutableRefObject<AnalyserNode | null>
}

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className="toggle-label" style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="toggle-input"
      />
      <span className="toggle-switch" />
      <span className="toggle-text">{label}</span>
    </label>
  )
}

interface SliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  formatValue?: (v: number) => string
  disabled?: boolean
}

function Slider({ label, min, max, step, value, onChange, formatValue, disabled }: SliderProps) {
  const displayValue = formatValue ? formatValue(value) : value.toFixed(2)
  return (
    <div className="slider-row" style={{ opacity: disabled ? 0.5 : 1 }}>
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-input"
        disabled={disabled}
      />
      <span className="slider-value">{displayValue}</span>
    </div>
  )
}

interface MicLevelMeterProps {
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  threshold: number
  showThreshold: boolean
}

function MicLevelMeter({ analyserRef, threshold, showThreshold }: MicLevelMeterProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const frameRef = React.useRef<number | null>(null)
  const [gateOpen, setGateOpen] = React.useState(false)

  React.useEffect(() => {
    const draw = () => {
      const analyser = analyserRef.current
      const canvas = canvasRef.current
      if (!analyser || !canvas) {
        frameRef.current = requestAnimationFrame(draw)
        return
      }

      const ctx = canvas.getContext('2d')!
      const data = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(data)

      // Calculate RMS
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length)

      const open = rms > threshold
      setGateOpen(open)

      const W = canvas.width,
        H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // Background
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, W, H)

      // Level bar (green when gate open, red when closed)
      const fillW = Math.min(rms * W * 8, W)
      ctx.fillStyle = open ? '#22c55e' : '#ef4444'
      ctx.fillRect(0, 0, fillW, H)

      // Threshold line
      if (showThreshold) {
        const threshX = Math.min(threshold * W * 8, W)
        ctx.strokeStyle = '#facc15'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(threshX, 0)
        ctx.lineTo(threshX, H)
        ctx.stroke()
      }

      frameRef.current = requestAnimationFrame(draw)
    }
    frameRef.current = requestAnimationFrame(draw)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [analyserRef, threshold, showThreshold])

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={260}
        height={20}
        style={{ borderRadius: 4, width: '100%', height: 20 }}
      />
      {showThreshold && (
        <div style={{ fontSize: 11, color: gateOpen ? '#22c55e' : '#ef4444', marginTop: 4 }}>
          Gate: {gateOpen ? 'OPEN — passing audio' : 'CLOSED — muting noise'}
        </div>
      )}
    </div>
  )
}

export function VoiceEffectsPage({
  voiceEffects,
  onUpdate,
  micPassthroughActive,
  micDeviceId,
  analyserRef,
}: VoiceEffectsPageProps) {
  const { t } = useTranslation()

  if (!micDeviceId) {
    return (
      <div className="settings-page">
        <div className="settings-section">
          <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <MicOff size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <p>{t('voiceFx.noMic')}</p>
          </div>
        </div>
      </div>
    )
  }

  const updateSetting = (key: keyof VoiceEffectsSettings, value: any) => {
    onUpdate({ ...voiceEffects, [key]: value })
  }

  const updateNestedSetting = (parent: keyof VoiceEffectsSettings, key: string, value: any) => {
    const parentObj = voiceEffects[parent] as any
    updateSetting(parent, { ...parentObj, [key]: value })
  }

  return (
    <div className="settings-page">
      <div className="settings-section">
        <div className="settings-section-title">
          <Mic size={14} /> {t('voiceFx.title')}
          {voiceEffects.enabled && micPassthroughActive && (
            <span className="badge-sm badge-active" style={{ marginLeft: '12px' }}>●LIVE</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
          <Toggle
            label={t('voiceFx.masterEnable')}
            checked={voiceEffects.enabled}
            onChange={(v) => updateSetting('enabled', v)}
          />

          {voiceEffects.enabled && (
            <>
              {voiceEffects.testMode && (
                <div
                  style={{
                    background: '#facc15',
                    color: '#000',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '2px solid #f59e0b',
                  }}
                >
                  <Mic size={16} /> TEST MODE ACTIVE — You are hearing your own mic
                </div>
              )}

              <Toggle
                label={t('voiceFx.testMode')}
                checked={voiceEffects.testMode}
                onChange={(v) => updateSetting('testMode', v)}
              />

              <div style={{ height: '1px', backgroundColor: '#e0e0e0', margin: '12px 0' }} />

              {/* Noise Gate */}
              <div>
                <Toggle
                  label={t('voiceFx.noiseGate')}
                  checked={voiceEffects.noiseGate.enabled}
                  onChange={(v) => updateNestedSetting('noiseGate', 'enabled', v)}
                />
                {voiceEffects.noiseGate.enabled && (
                  <>
                    <Slider
                      label={t('voiceFx.noiseGate.threshold')}
                      min={0}
                      max={0.15}
                      step={0.001}
                      value={voiceEffects.noiseGate.threshold}
                      onChange={(v) => updateNestedSetting('noiseGate', 'threshold', v)}
                      formatValue={(v) => v.toFixed(3)}
                    />
                    <MicLevelMeter
                      analyserRef={analyserRef}
                      threshold={voiceEffects.noiseGate.threshold}
                      showThreshold={true}
                    />
                  </>
                )}
              </div>

              {/* Robot Voice */}
              <div>
                <Toggle
                  label={t('voiceFx.robot')}
                  checked={voiceEffects.robot.enabled}
                  onChange={(v) => updateNestedSetting('robot', 'enabled', v)}
                />
                {voiceEffects.robot.enabled && (
                  <Slider
                    label={t('voiceFx.robot.frequency')}
                    min={10}
                    max={100}
                    step={1}
                    value={voiceEffects.robot.frequency}
                    onChange={(v) => updateNestedSetting('robot', 'frequency', v)}
                    formatValue={(v) => `${Math.round(v)}Hz`}
                  />
                )}
              </div>

              {/* Telephone */}
              <div>
                <Toggle
                  label={t('voiceFx.telephone')}
                  checked={voiceEffects.telephone.enabled}
                  onChange={(v) => updateNestedSetting('telephone', 'enabled', v)}
                />
              </div>

              {/* Reverb */}
              <div>
                <Toggle
                  label={t('voiceFx.reverb')}
                  checked={voiceEffects.reverb.enabled}
                  onChange={(v) => updateNestedSetting('reverb', 'enabled', v)}
                />
                {voiceEffects.reverb.enabled && (
                  <Slider
                    label={t('voiceFx.reverb.decay')}
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={voiceEffects.reverb.decay}
                    onChange={(v) => updateNestedSetting('reverb', 'decay', v)}
                    formatValue={(v) => `${v.toFixed(1)}s`}
                  />
                )}
              </div>

              {/* Kid Voice */}
              <div>
                <Toggle
                  label={t('voiceFx.kidVoice')}
                  checked={voiceEffects.kidVoice.enabled}
                  onChange={(v) => updateNestedSetting('kidVoice', 'enabled', v)}
                />
                {voiceEffects.kidVoice.enabled && (
                  <Slider
                    label={t('voiceFx.kidVoice.gain')}
                    min={0}
                    max={20}
                    step={1}
                    value={voiceEffects.kidVoice.gain}
                    onChange={(v) => updateNestedSetting('kidVoice', 'gain', v)}
                    formatValue={(v) => `+${Math.round(v)}dB`}
                  />
                )}
              </div>

              {/* Lady Voice */}
              <div>
                <Toggle
                  label={t('voiceFx.ladyVoice')}
                  checked={voiceEffects.ladyVoice.enabled}
                  onChange={(v) => updateNestedSetting('ladyVoice', 'enabled', v)}
                />
                {voiceEffects.ladyVoice.enabled && (
                  <Slider
                    label={t('voiceFx.ladyVoice.gain')}
                    min={0}
                    max={20}
                    step={1}
                    value={voiceEffects.ladyVoice.gain}
                    onChange={(v) => updateNestedSetting('ladyVoice', 'gain', v)}
                    formatValue={(v) => `+${Math.round(v)}dB`}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
