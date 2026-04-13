import React, { useEffect, useState } from 'react'
import { Loader2, Download, RotateCcw, AlertTriangle, CheckCircle2, Cable, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type SetupStep = 'checking' | 'not-found' | 'restart' | 'error' | 'dev-skip'

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

  function handleOpenDownload() {
    // Open VB-Cable download URL
    window.electronAPI.openExternal('https://vb-audio.com/Cable/')
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

            <div className="vbcable-instructions">
              <h3>{t('vbcable.installSteps')}</h3>
              <ol className="vbcable-steps-list">
                <li>{t('vbcable.step1')}</li>
                <li>{t('vbcable.step2')}</li>
                <li>{t('vbcable.step3')}</li>
                <li>{t('vbcable.step4')}</li>
              </ol>
            </div>

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

            <div className="vbcable-actions-row">
              <button className="btn-primary large" onClick={handleOpenDownload}>
                <ExternalLink size={16} /> {t('vbcable.downloadNow')}
              </button>
              <button className="btn-secondary" onClick={() => checkStatus()}>
                <RotateCcw size={14} /> {t('vbcable.checkAgain')}
              </button>
            </div>
            <button className="btn-ghost vbcable-skip" onClick={handleSkip}>
              {t('vbcable.skip')}
            </button>
          </>
        )}

        {/* ── Success ── */}
        {step === 'restart' && (
          <>
            <div className="vbcable-icon success">
              <CheckCircle2 size={36} />
            </div>
            <h2>{t('vbcable.installed')}</h2>
            <p className="vbcable-desc">
              {t('vbcable.readyToUse')}
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
