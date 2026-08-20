import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'
import { WiFiNetwork } from '../api/types'
import { discoverMachine } from '../utils/discovery'

type Phase = 'form' | 'sending' | 'waiting' | 'done'

const ProvisionScreen: React.FC = () => {
  const { api, connect, disconnect } = useMachine()
  const navigate = useNavigate()

  const [networks, setNetworks] = useState<WiFiNetwork[]>([])
  const [scanning, setScanning] = useState(false)
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async () => {
    if (!api) return
    setScanning(true)
    setError(null)

    // A máquina responde na hora com o que tem em cache e varre em background;
    // insistimos até ela terminar. Falha isolada de rede não aborta a espera:
    // durante a varredura o AP fica instável por ser um rádio só.
    let lastError: unknown = null
    try {
      for (let i = 0; i < 12; i++) {
        try {
          const result = await api.scanWiFi()
          lastError = null
          // Mais forte primeiro; o mesmo SSID pode aparecer em vários APs.
          const unique = new Map<string, WiFiNetwork>()
          for (const n of [...result.networks].sort((a, b) => b.rssi - a.rssi)) {
            if (!unique.has(n.ssid)) unique.set(n.ssid, n)
          }
          setNetworks([...unique.values()])
          if (!result.scanning && unique.size > 0) return
        } catch (err) {
          lastError = err
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
      if (lastError) {
        setError(lastError instanceof Error ? lastError.message : String(lastError))
      }
    } finally {
      setScanning(false)
    }
  }, [api])

  useEffect(() => {
    void scan()
  }, [scan])

  const handleSubmit = async () => {
    if (!api) return
    if (!ssid.trim()) {
      setError('Escolha ou digite a rede.')
      return
    }
    setError(null)
    setPhase('sending')
    try {
      await api.provisionWiFi(ssid.trim(), password)
    } catch (err) {
      // A máquina derruba o AP logo após aceitar a credencial, então a
      // resposta pode nunca chegar. Isso não significa que falhou.
      console.warn('[provision] resposta nao recebida (esperado se o AP caiu)', err)
    }

    // O AP morreu: o app perde a rede da máquina até o celular voltar ao Wi-Fi de casa.
    disconnect()
    setPhase('waiting')

    // Tenta reencontrar a máquina já em modo STA.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const url = await discoverMachine()
      if (url) {
        try {
          const status = await connect(url)
          if (status.wifiMode === 'sta') {
            setPhase('done')
            navigate('/', { replace: true })
            return
          }
        } catch {
          /* segue tentando */
        }
      }
    }

    setPhase('form')
    setError(
      'Nao reencontrei a maquina. Conecte o celular na sua rede Wi-Fi de casa e ' +
        'busque de novo na tela inicial.',
    )
  }

  if (phase === 'sending' || phase === 'waiting') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-latte px-6 text-center safe-area-top safe-area-bottom">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-cream p-6 shadow-card">
          <div className="text-sm font-semibold text-ink">
            {phase === 'sending' ? 'Enviando credenciais...' : 'Aguardando a maquina entrar na rede'}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            A maquina desligou o modo <strong>Philco-Setup</strong> e esta conectando em{' '}
            <strong>{ssid}</strong>. Volte o celular para a sua rede Wi-Fi de casa — a
            busca continua sozinha.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-latte px-6 py-8 safe-area-top safe-area-bottom">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-xl font-bold text-ink">Wi-Fi da maquina</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Escolha a rede de casa. A maquina salva a credencial, sai do modo de
          configuracao e passa a ser acessada normalmente pela sua rede.
        </p>

        <div className="mt-5 rounded-2xl border border-line bg-cream p-5 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-muted">
              Redes encontradas
            </label>
            <button
              onClick={scan}
              disabled={scanning}
              className="text-xs font-semibold text-mocha disabled:opacity-40"
            >
              {scanning ? 'Buscando...' : 'Atualizar'}
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-xl border border-line bg-latte">
            {networks.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted">
                {scanning ? 'Varrendo redes...' : 'Nenhuma rede encontrada.'}
              </p>
            )}
            {networks.map((n) => (
              <button
                key={n.ssid}
                onClick={() => setSsid(n.ssid)}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm ${
                  ssid === n.ssid ? 'bg-foam font-semibold text-ink' : 'text-ink active:bg-foam'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{n.ssid}</span>
                <span className="ml-2 shrink-0 text-xs text-muted">
                  {n.secure ? 'protegida' : 'aberta'} · {n.rssi} dBm
                </span>
              </button>
            ))}
          </div>

          <label className="mb-1.5 mt-4 block text-xs font-medium uppercase tracking-wide text-muted">
            Rede (SSID)
          </label>
          <input
            type="text"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="MinhaRede"
            className="w-full rounded-xl border border-line bg-latte px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-mocha"
          />

          <label className="mb-1.5 mt-3 block text-xs font-medium uppercase tracking-wide text-muted">
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="deixe vazio se a rede for aberta"
            className="w-full rounded-xl border border-line bg-latte px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-mocha"
          />

          <button
            onClick={handleSubmit}
            className="mt-4 w-full rounded-xl bg-mocha py-3.5 text-sm font-bold uppercase tracking-wide text-cream shadow-raised active:bg-mocha-dark"
          >
            Conectar maquina na rede
          </button>

          {error && (
            <div className="mt-4 rounded-xl border border-brick/30 bg-brick/10 px-3 py-2.5 text-xs text-brick">
              {error}
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/setup', { replace: true })}
          className="mt-4 w-full rounded-xl border border-line py-2.5 text-xs font-semibold text-muted active:bg-foam"
        >
          Voltar
        </button>
      </div>
    </div>
  )
}

export default ProvisionScreen
