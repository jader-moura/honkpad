import React, { useEffect, useState } from 'react'
import { Loader2, Download, RotateCcw, AlertTriangle, CheckCircle2, Cable, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type SetupStep = 'checking' | 'not-found' | 'installing' | 'restart' | 'error' | 'dev-skip'

interface VBCableSetupProps {
  onComplete: () => void
}

export function VBCableSetup({ onComplete }: VBCableSetupProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<SetupStep>('checking')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    setStep('checking')
    try {
      const status = await window.electronAPI.checkVBCable()
      if (status.installed) {
        // Already installed — mark flag and continue
        await window.electronAPI.setVBCableFlag(true)
        onComplete()
      } else {
        setStep('not-found')
      }
    } catch (err) {
      setStep('error')
      setErrorMsg(String(err))
    }
  }

  async function handleInstall() {
    setStep('installing')
    try {
      const result = await window.electronAPI.installVBCable()
      if (result.success) {
        await window.electronAPI.setVBCableFlag(true)
        setStep('restart')
      } else {
        setStep('error')
        setErrorMsg(result.error || 'Erro desconhecido na instalação.')
      }
    } catch (err) {
      setStep('error')
      setErrorMsg(String(err))
    }
  }

  function handleSkip() {
    // Allow user to skip and use without VB-Cable
    onComplete()
  }

  return (
    <div className="vbcable-setup-overlay">
      <div className="vbcable-setup-box">

        {/* ── Checking ── */}
        {step === 'checking' && (
          <>
            <div className="vbcable-icon spinning">
              <Loader2 size={36} />
            </div>
            <h2>{t('vbcable.checking')}</h2>
            <p className="vbcable-desc">
              {t('vbcable.setup')}
            </p>
          </>
        )}

        {/* ── Not Found ── */}
        {step === 'not-found' && (
          <>
            <div className="vbcable-icon cable">
              <Cable size={36} />
            </div>
            <h2>{t('vbcable.notFound')}</h2>
            <p className="vbcable-desc">
              {t('vbcable.desc')}
            </p>
            <div className="vbcable-features">
              <div className="vbcable-feature">
                <CheckCircle2 size={14} />
                <span>{t('vbcable.free')}</span>
              </div>
              <div className="vbcable-feature">
                <CheckCircle2 size={14} />
                <span>{t('vbcable.installTime')}</span>
              </div>
              <div className="vbcable-feature">
                <CheckCircle2 size={14} />
                <span>{t('vbcable.adminRequired')}</span>
              </div>
            </div>
            <button className="btn-primary large" onClick={handleInstall}>
              <Download size={16} /> {t('vbcable.installNow')}
            </button>
            <button className="btn-ghost vbcable-skip" onClick={handleSkip}>
              {t('vbcable.skip')}
            </button>
          </>
        )}

        {/* ── Installing ── */}
        {step === 'installing' && (
          <>
            <div className="vbcable-icon spinning">
              <Loader2 size={36} />
            </div>
            <h2>{t('vbcable.installing')}</h2>
            <p className="vbcable-desc">
              {t('vbcable.adminPrompt')}
            </p>
            <div className="vbcable-progress">
              <div className="vbcable-progress-bar" />
            </div>
          </>
        )}

        {/* ── Restart ── */}
        {step === 'restart' && (
          <>
            <div className="vbcable-icon success">
              <CheckCircle2 size={36} />
            </div>
            <h2>{t('vbcable.installed')}</h2>
            <p className="vbcable-desc">
              {t('vbcable.restart')}
            </p>
            <p className="vbcable-subdesc">
              {t('vbcable.restartAfter')}
            </p>
            <button className="btn-primary large" onClick={() => onComplete()}>
              {t('vbcable.understood')}
            </button>
          </>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <>
            <div className="vbcable-icon error">
              <AlertTriangle size={36} />
            </div>
            <h2>{t('vbcable.installError')}</h2>
            <p className="vbcable-desc">
              {t('vbcable.installErrorDesc')}
            </p>
            {errorMsg && (
              <div className="vbcable-error-detail">{errorMsg}</div>
            )}
            <div className="vbcable-actions-row">
              <button className="btn-primary" onClick={() => checkStatus()}>
                <RotateCcw size={14} /> {t('vbcable.retry')}
              </button>
              <button className="btn-ghost" onClick={handleSkip}>
                {t('vbcable.skip')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
