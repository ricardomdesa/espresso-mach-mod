import React, { useState, useEffect } from 'react'
import { useMachine } from '../context/MachineContext'
import { discoverMachine } from '../utils/discovery'
import ConnectionBadge from '../components/ConnectionBadge'

const SetupScreen: React.FC = () => {
  const { connect, connected, baseUrl } = useMachine()
  const [searching, setSearching] = useState(false)
  const [manualIp, setManualIp] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAutoDiscover = async () => {
    setSearching(true)
    setError(null)
    const url = await discoverMachine()
    setSearching(false)
    if (url) {
      connect(url)
    } else {
      setError('Maquina nao encontrada na rede. Tente inserir o IP manualmente.')
    }
  }

  const handleManualConnect = () => {
    setError(null)
    const url = manualIp.startsWith('http') ? manualIp : `http://${manualIp}`
    connect(url)
  }

  useEffect(() => {
    handleAutoDiscover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 safe-area-top safe-area-bottom">
      <h1 className="mb-2 text-3xl font-bold" style={{ color: 'var(--color-accent)' }}>
        Philco Mod
      </h1>
      <p className="mb-8 text-neutral-400">Configuracao da maquina</p>

      <div className="mb-6 w-full max-w-sm rounded-xl bg-neutral-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-neutral-300">Status</span>
          <ConnectionBadge />
        </div>

        {baseUrl && (
          <div className="mb-4 text-xs text-neutral-500">
            IP: {baseUrl}
          </div>
        )}

        {connected ? (
          <div className="text-center text-sm text-green-400">
            Conectado! Redirecionando...
          </div>
        ) : (
          <>
            <button
              onClick={handleAutoDiscover}
              disabled={searching}
              className="mb-4 w-full rounded-lg py-3 font-semibold text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {searching ? 'Buscando...' : 'Buscar maquina automaticamente'}
            </button>

            <div className="mb-2 text-center text-xs text-neutral-500">ou</div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="IP manual (ex: 192.168.1.50)"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              />
              <button
                onClick={handleManualConnect}
                className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-600"
              >
                Conectar
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="mt-4 text-center text-sm text-red-400">{error}</div>
        )}
      </div>

      <div className="max-w-sm text-xs text-neutral-500">
        <p className="mb-2">
          <strong>Dica:</strong> se a maquina estiver em modo de configuracao (AP),
          conecte o celular na rede <code>Philco-Setup</code> primeiro.
        </p>
        <p>
          Em modo normal, a maquina aparece como <code>philco.local</code> na sua
          rede Wi-Fi.
        </p>
      </div>
    </div>
  )
}

export default SetupScreen
