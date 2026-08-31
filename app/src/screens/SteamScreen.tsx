import React, { useEffect, useState } from 'react'
import { useMachine } from '../context/MachineContext'
import { useFormatters } from '../utils/formatters'
import { useMachineApi } from '../hooks/useMachineApi'
import Screen from '../components/Screen'
import NumberField from '../components/NumberField'
import { MachineState } from '../api/types'

// Default do alvo de vapor no firmware (volta pra isto a cada boot).
const STEAM_DEFAULT_C = 90
const STEAM_MIN_C = 80
const STEAM_MAX_C = 115

const SteamScreen: React.FC = () => {
  const { currentFrame, status, connected } = useMachine()
  const { temp } = useFormatters()
  const { setSteam } = useMachineApi()

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftTarget, setDraftTarget] = useState(STEAM_DEFAULT_C)

  const machineState: MachineState = currentFrame?.state ?? status?.state ?? 'idle'
  const current = currentFrame?.temp ?? status?.temp ?? null
  const steaming = !!status?.steam
  const target = status?.steamSetpoint ?? STEAM_DEFAULT_C
  // O firmware recusa ligar a vaporização durante uma extração/perfil (409).
  const blockedByExtraction =
    machineState === 'extracting' || machineState === 'preheating'

  // Enquanto não estiver editando, o rascunho acompanha o alvo real da máquina.
  useEffect(() => {
    if (!editing) setDraftTarget(target)
  }, [target, editing])

  // O alvo só é editável com a vaporização desligada — deixa claro que o valor
  // ajustado passa a valer quando ligar. Se ligar com o editor aberto, fecha.
  useEffect(() => {
    if (steaming) setEditing(false)
  }, [steaming])

  const pct =
    current == null ? 0 : Math.max(0, Math.min(100, (current / target) * 100))
  const atTarget = current != null && current >= target - 2

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

  const handleSaveTarget = async () => {
    setError(null)
    setBusy(true)
    try {
      const clamped = Math.max(STEAM_MIN_C, Math.min(STEAM_MAX_C, draftTarget))
      // Mantém o estado on/off atual, só muda o alvo. Vale mesmo com o vapor
      // desligado (o firmware guarda o alvo pra próxima vez que ligar).
      await setSteam(steaming, clamped)
      setEditing(false)
    } catch (e) {
      setError('Erro ao enviar comando: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const cardClass = 'rounded-2xl border border-line bg-cream p-4 shadow-card'
  const sectionTitle = 'text-xs font-medium uppercase tracking-wide text-muted'

  const editButton = (
    <button
      onClick={() => {
        setDraftTarget(target)
        setEditing((v) => !v)
      }}
      disabled={!connected || steaming}
      aria-label="Editar alvo da vaporizacao"
      title={
        steaming
          ? 'Desligue a vaporizacao para ajustar o alvo'
          : 'Editar alvo da vaporizacao'
      }
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
        editing ? 'bg-mocha/10 text-mocha' : 'text-muted active:bg-foam'
      }`}
    >
      {/* lápis */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  )

  return (
    <Screen title="Vaporizacao" showConnection action={editButton}>
      {/* Mostrador de temperatura */}
      <div className={`${cardClass} text-center`}>
        <div className={sectionTitle}>Temperatura da caldeira</div>
        <div className="tabular-live mt-2 text-5xl font-semibold text-roast">
          {current != null ? temp(current) : '--'}
        </div>

        {editing ? (
          <div className="mt-3 flex items-center justify-center gap-2">
            <NumberField
              value={draftTarget}
              onChange={setDraftTarget}
              min={STEAM_MIN_C}
              max={STEAM_MAX_C}
              ariaLabel="Alvo da vaporizacao em graus Celsius"
              className="tabular-live w-20 rounded-xl border border-line bg-latte px-2 py-1.5 text-center text-xl font-semibold text-ink outline-none focus:border-mocha"
            />
            <span className="text-sm text-muted">°C</span>
            <button
              onClick={handleSaveTarget}
              disabled={busy}
              className="rounded-xl bg-mocha px-3 py-1.5 text-xs font-semibold text-cream active:bg-mocha-dark disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        ) : (
          <div className="tabular-live mt-1 text-xs text-muted">
            alvo {temp(target)}
          </div>
        )}

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
        Ajuste o alvo com a vaporizacao desligada; ele passa a valer quando voce
        liga. O alvo nao e salvo: volta para {STEAM_DEFAULT_C} °C quando a
        maquina reinicia. Ao parar a vaporizacao a maquina volta o alvo de
        temperatura para 70 °C (cafe). A caldeira leva alguns minutos para
        descer.
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
