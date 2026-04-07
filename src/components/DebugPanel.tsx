import React, { useEffect, useState } from 'react'
import { Bug, X, Wifi, WifiOff, Volume2, Monitor, Cable, Mic } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConflictInfo, VBCableStatus } from '../types/global'

interface AudioDeviceDebug {
  deviceId: string
  label: string
  kind: string
}

interface DebugPanelProps {
  visible: boolean
  onClose: () => void
  cableInputDeviceId: string | null
  monitorDeviceId: string | null
  micDeviceId: string | null
  micPassthroughActive: boolean
  virtualVolume: number
  monitorVolume: number
  vbcableStatus: VBCableStatus | null
  conflict: ConflictInfo | null
}

export function DebugPanel({
  visible,
  onClose,
  cableInputDeviceId,
  monitorDeviceId,
  micDeviceId,
  micPassthroughActive,
  virtualVolume,
  monitorVolume,
  vbcableStatus,
  conflict,
}: DebugPanelProps) {
  const { t } = useTranslation()
  const [devices, setDevices] = useState<AudioDeviceDebug[]>([])

  useEffect(() => {
    if (!visible) return
    async function loadDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {})
        const all = await navigator.mediaDevices.enumerateDevices()
        setDevices(
          all.map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `(${t('debug.unnamed')} — ${d.deviceId.slice(0, 12)}…)`,
            kind: d.kind,
          })),
        )
      } catch {
        // permissions
      }
    }
    loadDevices()
  }, [visible])

  if (!visible) return null

  const inputs = devices.filter((d) => d.kind === 'audioinput')
  const outputs = devices.filter((d) => d.kind === 'audiooutput')

  return (
    <div className="debug-panel-overlay" onClick={onClose}>
      <div className="debug-panel" onClick={(e) => e.stopPropagation()}>
        <div className="debug-header">
          <Bug size={16} />
          <span>{t('debug.title')}</span>
          <button className="debug-close" onClick={onClose}><X size={14} /></button>
        </div>

        {/* VB-Cable Status */}
        <div className="debug-section">
          <div className="debug-section-title">
            <Cable size={13} /> VB-Cable
          </div>
          {vbcableStatus ? (
            <div className="debug-kv-list">
              <div className="debug-kv">
                <span>{t('debug.installed')}</span>
                <span className={vbcableStatus.installed ? 'debug-ok' : 'debug-err'}>
                  {vbcableStatus.installed ? t('debug.yes') : t('debug.no')}
                </span>
              </div>
              <div className="debug-kv">
                <span>{t('debug.cableInput')}</span>
                <span className={vbcableStatus.cableInputFound ? 'debug-ok' : 'debug-err'}>
                  {vbcableStatus.cableInputFound ? t('debug.found') : t('debug.notFound')}
                </span>
              </div>
              <div className="debug-kv">
                <span>{t('debug.cableOutput')}</span>
                <span className={vbcableStatus.cableOutputFound ? 'debug-ok' : 'debug-err'}>
                  {vbcableStatus.cableOutputFound ? t('debug.found') : t('debug.notFound')}
                </span>
              </div>
            </div>
          ) : (
            <div className="debug-muted">{t('debug.notChecked')}</div>
          )}
        </div>

        {/* Routing */}
        <div className="debug-section">
          <div className="debug-section-title">
            <Volume2 size={13} /> {t('debug.routing')}
          </div>
          <div className="debug-kv-list">
            <div className="debug-kv">
              <span>{t('debug.virtualOutput')}</span>
              <span className="debug-val">
                {cableInputDeviceId
                  ? outputs.find((d) => d.deviceId === cableInputDeviceId)?.label || cableInputDeviceId.slice(0, 16)
                  : '—'}
              </span>
            </div>
            <div className="debug-kv">
              <span>{t('debug.monitor')}</span>
              <span className="debug-val">
                {monitorDeviceId
                  ? outputs.find((d) => d.deviceId === monitorDeviceId)?.label || monitorDeviceId.slice(0, 16)
                  : t('audio.systemDefault')}
              </span>
            </div>
            <div className="debug-kv">
              <span>{t('debug.virtualVolume')}</span>
              <span className="debug-val">{Math.round(virtualVolume * 100)}%</span>
            </div>
            <div className="debug-kv">
              <span>{t('debug.monitorVolume')}</span>
              <span className="debug-val">{Math.round(monitorVolume * 100)}%</span>
            </div>
            <div className="debug-kv">
              <span>{t('debug.micPassthrough')}</span>
              <span className={micPassthroughActive ? 'debug-ok' : 'debug-muted'}>
                {micPassthroughActive ? t('debug.active') : t('debug.inactive')}
              </span>
            </div>
            <div className="debug-kv">
              <span>{t('debug.microphone')}</span>
              <span className="debug-val">
                {micDeviceId
                  ? inputs.find((d) => d.deviceId === micDeviceId)?.label || micDeviceId.slice(0, 16)
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Conflicts */}
        <div className="debug-section">
          <div className="debug-section-title">
            {conflict?.hasConflict ? <WifiOff size={13} /> : <Wifi size={13} />}
            {t('debug.conflicts')}
          </div>
          {conflict?.hasConflict ? (
            <ul className="debug-conflict-list">
              {conflict.details.map((d, i) => (
                <li key={i} className="debug-err">{d}</li>
              ))}
            </ul>
          ) : (
            <div className="debug-ok">{t('debug.noConflict')}</div>
          )}
        </div>

        {/* All Devices */}
        <div className="debug-section">
          <div className="debug-section-title">
            <Monitor size={13} /> {t('debug.outputDevices', { count: outputs.length })}
          </div>
          <div className="debug-device-list">
            {outputs.map((d) => (
              <div key={d.deviceId} className={`debug-device ${d.deviceId === cableInputDeviceId ? 'active-cable' : d.deviceId === monitorDeviceId ? 'active-monitor' : ''}`}>
                <span className="debug-device-label">{d.label}</span>
                <span className="debug-device-id">{d.deviceId.slice(0, 20)}…</span>
              </div>
            ))}
          </div>
        </div>

        <div className="debug-section">
          <div className="debug-section-title">{t('debug.inputDevices', { count: inputs.length })}</div>
          <div className="debug-device-list">
            {inputs.map((d) => (
              <div key={d.deviceId} className="debug-device">
                <span className="debug-device-label">{d.label}</span>
                <span className="debug-device-id">{d.deviceId.slice(0, 20)}…</span>
              </div>
            ))}
          </div>
        </div>

        <div className="debug-footer">
          Ctrl+Shift+D para fechar
        </div>
      </div>
    </div>
  )
}
