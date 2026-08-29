import React, { useState } from 'react'
import { useMachine } from '../context/MachineContext'
import { useFormatters } from '../utils/formatters'
import { useMachineApi } from '../hooks/useMachineApi'
import Screen from '../components/Screen'
import { MachineState } from '../api/types'

// Alvo do modo vaporização. O firmware usa a própria constante (TEMP_STEAM_C);
// aqui é só rótulo/percentual da tela.
const STEAM_TARGET_C = 90

const SteamScreen: React.FC = () => {
  const { currentFrame, status, connected } = useMachine()
  const { temp } = useFormatters()
  const { setSteam } = useMachineApi()

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const machineState: MachineState = currentFrame?.state ?? status?.state ?? 'idle'
  const current = currentFrame?.temp ?? status?.temp ?? null
  const steaming = !!status?.steam
  // O firmware recusa ligar a vaporização durante uma extração/perfil (409).
  const blockedByExtraction =
    machineState === 'extracting' || machineState === 'preheating'

  const pct =
    current == null ? 0 : Math.max(0, Math.min(100, (current / STEAM_TARGET_C) * 100))
  const atTarget = current != null && current >= STEAM_TARGET_C - 2

  const handleToggle = async () => {
    setError(null)
    setBusy(true)
    try {
      await setSteam(!steaming)
    } catch (e) {
      setError('Erro ao enviar comando: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const cardClass = 'rounded-2xl border border-line bg-cream p-4 shadow-card'
  const sectionTitle = 'text-xs font-medium uppercase tracking-wide text-muted'

  return (
    <Screen title="Vaporizacao" showConnection>
      {/* Mostrador de temperatura */}
      <div className={`${cardClass} text-center`}>
        <div className={sectionTitle}>Temperatura da caldeira</div>
        <div className="tabular-live mt-2 text-5xl font-semibold text-roast">
          {current != null ? temp(current) : '--'}
        </div>
        <div className="tabular-live mt-1 text-xs text-muted">
          alvo {temp(STEAM_TARGET_C)}
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-foam">
          <div
            className="h-full rounded-full bg-roast transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <span
          className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
            !connected
              ? 'bg-foam text-muted'
              : steaming
                ? atTarget
                  ? 'bg-herb/10 text-herb'
                  : 'bg-roast/10 text-roast'
                : 'bg-foam text-muted'
          }`}
        >
          {!connected
            ? 'Offline'
            : steaming
              ? atTarget
                ? 'Pronto para vapor'
                : 'Aquecendo p/ vapor'
              : 'Vaporizacao desligada'}
        </span>
      </div>

      {blockedByExtraction && !steaming && (
        <div className="mt-4 rounded-xl border border-line bg-foam/60 px-4 py-3 text-sm text-muted">
          Extracao em andamento. Pare a extracao para usar a vaporizacao.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          {error}
        </div>
      )}

      <p className="mt-4 px-1 text-xs leading-relaxed text-muted">
        Ao parar a vaporizacao a maquina volta o alvo de temperatura para 70 °C
        (cafe). A caldeira leva alguns minutos para descer.
      </p>

      {/* Start/stop */}
      <button
        onClick={handleToggle}
        disabled={!connected || busy || (blockedByExtraction && !steaming)}
        className={`mt-4 w-full rounded-2xl py-5 text-base font-bold uppercase tracking-wide text-cream shadow-raised transition-colors disabled:opacity-40 disabled:shadow-none ${
          steaming ? 'bg-brick active:bg-brick/90' : 'bg-mocha active:bg-mocha-dark'
        }`}
      >
        {steaming ? 'Parar vaporizacao' : 'Iniciar vaporizacao'}
      </button>
    </Screen>
  )
}

export default SteamScreen
