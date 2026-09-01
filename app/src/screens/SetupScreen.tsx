import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'
import { discoverMachine, PROVISIONING_AP_URL } from '../utils/discovery'
import { bindToWifi, diagnoseNetwork } from '../native/networkBinder'

const SetupScreen: React.FC = () => {
  const { connect, connected, status, baseUrl, token } = useMachine()
  const navigate = useNavigate()
  const [searching, setSearching] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [manualIp, setManualIp] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const autoRan = useRef(false)

  // Pré-preenche o código de pareamento já guardado (aparece depois que o
  // connect automático o carrega do storage).
  useEffect(() => {
    if (token) setPairCode(token)
  }, [token])

  // Redireciona assim que a máquina confirma o modo: AP → pareamento,
  // qualquer outro (STA) → dashboard. Sem isso, o SetupScreen fica preso no
  // "Conectado! Redirecionando..." quando a máquina responde em STA — a rota
  // "/" só redireciona sozinha se o usuário já estiver nela, não em /setup.
  useEffect(() => {
    if (!connected || !status) return
    navigate(status.wifiMode === 'ap' ? '/provision' : '/', { replace: true })
  }, [connected, status, navigate])

  const tryConnect = async (url: string, code?: string) => {
    setConnecting(true)
    setError(null)
    try {
      // O usuário pode ter acabado de trocar de rede; re-prende o app à Wi-Fi
      // antes de falar com a máquina.
      await bindToWifi()
      await connect(url, code)
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
      await tryConnect(url, pairCode)
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
    void tryConnect(url, pairCode)
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
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">ESPresso</h1>
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
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                Codigo de pareamento
              </label>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ex.: 7c4a9f21b8e3"
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value.trim())}
                className="tabular-live w-full rounded-xl border border-line bg-latte px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-mocha"
              />
              <p className="mb-3 mt-1.5 text-xs leading-relaxed text-muted">
                O codigo fixo da sua maquina — na etiqueta dela (ou no log Serial
                no boot). Fica guardado no aparelho; so precisa digitar uma vez.
              </p>

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

          {/* A máquina pode estar desligada: dá pra usar o app offline para
              mexer em perfis e ajustes; sincroniza quando ela voltar. */}
          {!connected && !busy && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-xs text-muted">Máquina desligada? Use o app offline:</p>
              <div className="flex gap-2">
                <Link
                  to="/profiles"
                  className="flex-1 rounded-xl bg-foam py-2.5 text-center text-xs font-semibold text-ink active:bg-line"
                >
                  Perfis
                </Link>
                <Link
                  to="/settings"
                  className="flex-1 rounded-xl bg-foam py-2.5 text-center text-xs font-semibold text-ink active:bg-line"
                >
                  Ajustes
                </Link>
                {baseUrl && (
                  <Link
                    to="/"
                    className="flex-1 rounded-xl bg-foam py-2.5 text-center text-xs font-semibold text-ink active:bg-line"
                  >
                    Painel
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Ajuda */}
        <div className="mt-6 space-y-2 text-xs leading-relaxed text-muted">
          <p>
            <strong className="font-semibold text-ink">Primeira vez?</strong> Na maquina,
            segure o botao por <strong className="font-semibold text-ink">5 segundos</strong>{' '}
            — o LED comeca a piscar e ela liga o modo{' '}
            <code className="rounded bg-foam px-1.5 py-0.5 font-medium text-ink">
              Philco-Setup
            </code>
            . Conecte o celular nessa rede e use o botao de configurar Wi-Fi. Depois de
            receber a senha da sua rede, a maquina desliga esse modo e entra na sua rede
            normal.
          </p>
          <p>
            Em modo normal ela aparece como{' '}
            <code className="rounded bg-foam px-1.5 py-0.5 font-medium text-ink">
              philco.local
            </code>{' '}
            na sua rede Wi-Fi.
          </p>
          <p>
            O <strong className="font-semibold text-ink">codigo de pareamento</strong> e
            fixo da maquina e libera os comandos (ligar bomba, mudar setpoint...). Sem ele
            da pra ver as leituras, mas nao comandar.
          </p>
        </div>
      </div>
    </div>
  )
}

export default SetupScreen
