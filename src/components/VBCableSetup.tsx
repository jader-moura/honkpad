import React, { useEffect, useState } from 'react'
import { Loader2, Download, RotateCcw, AlertTriangle, CheckCircle2, Cable, X } from 'lucide-react'

type SetupStep = 'checking' | 'not-found' | 'installing' | 'restart' | 'error' | 'dev-skip'

interface VBCableSetupProps {
  onComplete: () => void
}

export function VBCableSetup({ onComplete }: VBCableSetupProps) {
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
            <h2>Verificando VB-Cable…</h2>
            <p className="vbcable-desc">
              Detectando se o VB-Audio Virtual Cable está instalado no seu sistema.
            </p>
          </>
        )}

        {/* ── Not Found ── */}
        {step === 'not-found' && (
          <>
            <div className="vbcable-icon cable">
              <Cable size={36} />
            </div>
            <h2>VB-Cable não encontrado</h2>
            <p className="vbcable-desc">
              O <strong>VB-Audio Virtual Cable</strong> é necessário para que outros
              ouçam seus sons em calls e jogos. Ele cria um microfone virtual no seu sistema.
            </p>
            <div className="vbcable-features">
              <div className="vbcable-feature">
                <CheckCircle2 size={14} />
                <span>Gratuito e seguro (vb-audio.com)</span>
              </div>
              <div className="vbcable-feature">
                <CheckCircle2 size={14} />
                <span>Instalação leva ~10 segundos</span>
              </div>
              <div className="vbcable-feature">
                <CheckCircle2 size={14} />
                <span>Requer permissão de administrador</span>
              </div>
            </div>
            <button className="btn-primary large" onClick={handleInstall}>
              <Download size={16} /> Instalar agora
            </button>
            <button className="btn-ghost vbcable-skip" onClick={handleSkip}>
              Pular — usar sem microfone virtual
            </button>
          </>
        )}

        {/* ── Installing ── */}
        {step === 'installing' && (
          <>
            <div className="vbcable-icon spinning">
              <Loader2 size={36} />
            </div>
            <h2>Instalando VB-Cable…</h2>
            <p className="vbcable-desc">
              O Windows pode pedir permissão de administrador.<br />
              Aceite o prompt do UAC para continuar.
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
            <h2>VB-Cable instalado!</h2>
            <p className="vbcable-desc">
              Para que o dispositivo de áudio virtual seja reconhecido, é necessário
              <strong> reiniciar o computador</strong>.
            </p>
            <p className="vbcable-subdesc">
              Após reiniciar, abra o Soundboard novamente e tudo estará configurado automaticamente.
            </p>
            <button className="btn-primary large" onClick={() => onComplete()}>
              Entendi — vou reiniciar depois
            </button>
          </>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <>
            <div className="vbcable-icon error">
              <AlertTriangle size={36} />
            </div>
            <h2>Erro na instalação</h2>
            <p className="vbcable-desc">
              Não foi possível instalar o VB-Cable automaticamente.
            </p>
            {errorMsg && (
              <div className="vbcable-error-detail">{errorMsg}</div>
            )}
            <div className="vbcable-actions-row">
              <button className="btn-primary" onClick={() => checkStatus()}>
                <RotateCcw size={14} /> Tentar novamente
              </button>
              <button className="btn-ghost" onClick={handleSkip}>
                Pular
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
