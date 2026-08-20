import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'
import { discoverMachine, PROVISIONING_AP_URL } from '../utils/discovery'
import { bindToWifi, diagnoseNetwork } from '../native/networkBinder'

const SetupScreen: React.FC = () => {
  const { connect, connected, status, baseUrl } = useMachine()
  const navigate = useNavigate()
  const [searching, setSearching] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [manualIp, setManualIp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const autoRan = useRef(false)

  // Máquina em modo AP só serve para receber a credencial de Wi-Fi.
  useEffect(() => {
    if (connected && status?.wifiMode === 'ap') {
      navigate('/provision', { replace: true })
    }
  }, [connected, status, navigate])

  const tryConnect = async (url: string) => {
    setConnecting(true)
    setError(null)
    try {
      // O usuário pode ter acabado de trocar de rede; re-prende o app à Wi-Fi
      // antes de falar com a máquina.
      await bindToWifi()
      await connect(url)
    } catch (err) {
      // Quase sempre a culpa é da rede do aparelho (VPN, dados móveis), não do
      // endereço — vale mais dizer isso do que repetir "timeout".
      const hint = await diagnoseNetwork()
      setError(
        hint ??
          `Nao consegui falar com a maquina em ${url}. ` +
            (err instanceof Error ? err.message : String(err)),
      )
    } finally {
      setConnecting(false)
    }
  }

  const handleAutoDiscover = async () => {
    setSearching(true)
    setError(null)
    await bindToWifi()
    const url = await discoverMachine()
    setSearching(false)
    if (url) {
      await tryConnect(url)
    } else {
      const hint = await diagnoseNetwork()
      setError(hint ?? 'Maquina nao encontrada na rede. Tente inserir o IP manualmente.')
    }
  }

  const handleManualConnect = () => {
    setError(null)
    const trimmed = manualIp.trim()
    if (!trimmed) {
      setError('Informe um IP ou endereco.')
      return
    }
    const url = trimmed.startsWith('http') ? trimmed : `http://${trimmed}`
    try {
      new URL(url)
    } catch {
      setError('Endereco invalido.')
      return
    }
    void tryConnect(url)
  }

  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    void handleAutoDiscover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const busy = searching || connecting

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-latte px-6 safe-area-top safe-area-bottom">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <svg
            className="h-14 w-14 text-mocha"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path d="M4 8h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" strokeLinejoin="round" />
            <path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" strokeLinecap="round" />
            <path d="M8 2.5V5M12 2.5V5" strokeLinecap="round" />
            <path d="M3 21h16" strokeLinecap="round" />
          </svg>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">Philco Mod</h1>
          <p className="mt-1 text-sm text-muted">Controle da sua espresso</p>
        </div>

        {/* Card de conexao */}
        <div className="rounded-2xl border border-line bg-cream p-5 shadow-card">
          {connected ? (
            <div className="py-4 text-center">
              <div className="text-sm font-semibold text-herb">Conectado!</div>
              <p className="mt-1 text-xs text-muted">Redirecionando...</p>
            </div>
          ) : (
            <>
              <button
                onClick={handleAutoDiscover}
                disabled={busy}
                className="w-full rounded-xl bg-mocha py-3.5 text-sm font-bold uppercase tracking-wide text-cream shadow-raised active:bg-mocha-dark disabled:opacity-40 disabled:shadow-none"
              >
                {searching ? 'Buscando maquina...' : connecting ? 'Conectando...' : 'Buscar maquina'}
              </button>

              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs text-muted">ou</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                Endereco manual
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="192.168.1.50"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualConnect()}
                  className="tabular-live min-w-0 flex-1 rounded-xl border border-line bg-latte px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-mocha"
                />
                <button
                  onClick={handleManualConnect}
                  disabled={connecting}
                  className="shrink-0 rounded-xl bg-foam px-4 py-2.5 text-sm font-semibold text-ink active:bg-line disabled:opacity-40"
                >
                  Conectar
                </button>
              </div>

              <button
                onClick={() => tryConnect(PROVISIONING_AP_URL)}
                disabled={connecting}
                className="mt-3 w-full rounded-xl border border-line py-2.5 text-xs font-semibold text-muted active:bg-foam disabled:opacity-40"
              >
                Configurar Wi-Fi da maquina (modo Philco-Setup)
              </button>

              {baseUrl && (
                <p className="mt-3 text-xs text-muted">
                  Ultimo endereco: <span className="tabular-live">{baseUrl}</span>
                </p>
              )}
            </>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-brick/30 bg-brick/10 px-3 py-2.5 text-xs text-brick">
              {error}
            </div>
          )}
        </div>

        {/* Ajuda */}
        <div className="mt-6 space-y-2 text-xs leading-relaxed text-muted">
          <p>
            <strong className="font-semibold text-ink">Primeira vez?</strong> Conecte o
            celular na rede{' '}
            <code className="rounded bg-foam px-1.5 py-0.5 font-medium text-ink">
              Philco-Setup
            </code>{' '}
            e use o botao de configurar Wi-Fi. Depois de receber a senha da sua rede, a
            maquina desliga esse modo e entra na sua rede normal.
          </p>
          <p>
            Em modo normal ela aparece como{' '}
            <code className="rounded bg-foam px-1.5 py-0.5 font-medium text-ink">
              philco.local
            </code>{' '}
            na sua rede Wi-Fi.
          </p>
        </div>
      </div>
    </div>
  )
}

export default SetupScreen
