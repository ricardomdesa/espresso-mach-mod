import React, { useEffect, useRef, useState } from 'react'
import { useMachine } from '../context/MachineContext'
import { useFormatters } from '../utils/formatters'
import { useMachineApi } from '../hooks/useMachineApi'
import { useLocalHistory } from '../hooks/useLocalHistory'
import Screen from '../components/Screen'
import TimerDisplay from '../components/TimerDisplay'
import LiveChart from '../components/LiveChart'
import { MachineState, WsFrame } from '../api/types'

const stateLabel: Record<MachineState, string> = {
  idle: 'Ocioso',
  heating: 'Aquecendo',
  preheating: 'Aquecendo p/ extracao',
  steaming: 'Vaporizando',
  extracting: 'Extraindo',
  error: 'Erro',
}

const stateStyle: Record<MachineState, string> = {
  idle: 'bg-foam text-muted',
  heating: 'bg-roast/10 text-roast',
  preheating: 'bg-roast/10 text-roast',
  steaming: 'bg-roast/10 text-roast',
  extracting: 'bg-mocha/10 text-mocha',
  error: 'bg-brick/10 text-brick',
}

interface StatCardProps {
  label: string
  value: string
  target: string
  accent: string
}

const StatCard: React.FC<StatCardProps> = ({ label, value, target, accent }) => (
  <div className="rounded-2xl border border-line bg-cream p-4 shadow-card">
    <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
    <div className={`tabular-live mt-1 text-3xl font-semibold ${accent}`}>{value}</div>
    <div className="tabular-live mt-0.5 text-xs text-muted">alvo {target}</div>
  </div>
)

interface ControlToggleProps {
  label: string
  on: boolean
  disabled: boolean
  onToggle: () => void
}

const ControlToggle: React.FC<ControlToggleProps> = ({ label, on, disabled, onToggle }) => (
  <button
    onClick={onToggle}
    disabled={disabled}
    className={`flex items-center justify-between rounded-2xl border p-4 text-left shadow-card transition-colors disabled:opacity-40 ${
      on ? 'border-mocha bg-mocha/10' : 'border-line bg-cream'
    }`}
  >
    <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
    <span
      className={`ml-2 inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
        on ? 'bg-mocha' : 'bg-line'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-cream shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </span>
  </button>
)

const DashboardScreen: React.FC = () => {
  const { currentFrame, status, connected, lastEvent, profiles, refreshProfiles } = useMachine()
  const { temp } = useFormatters()
  const { startExtraction, stopExtraction, setLed, setPump } = useMachineApi()
  const { add: addHistoryRecord } = useLocalHistory()

  const [chartData, setChartData] = useState<WsFrame[]>([])
  const [error, setError] = useState<string | null>(null)
  const isExtractingRef = useRef(false)
  const sessionFramesRef = useRef<WsFrame[]>([])
  // Se este componente monta com a extração já em andamento (ex.: navegou
  // para fora e voltou no meio do shot), sessionFramesRef só tem o rabo da
  // sessão — a média não pode ser cruzada com o timer cheio da máquina.
  const sessionIncompleteRef = useRef(false)

  // O frame/status trazem o ID do perfil ativo (ex.: "p3"); a tela mostra o nome.
  useEffect(() => {
    refreshProfiles().catch(() => {})
  }, [refreshProfiles])

  const activeProfileId = currentFrame?.profile ?? status?.profile ?? null
  const activeProfileName =
    profiles.find((p) => p.id === activeProfileId)?.name ?? activeProfileId

  useEffect(() => {
    if (!currentFrame) return

    if (currentFrame.state === 'extracting') {
      if (!isExtractingRef.current) {
        isExtractingRef.current = true
        sessionIncompleteRef.current = currentFrame.timer > 1
      }
      sessionFramesRef.current.push(currentFrame)
      setChartData((prev) => {
        const next = [...prev, currentFrame]
        // manter ultimos 30s de dados (a 100ms = 300 pontos)
        if (next.length > 300) return next.slice(-300)
        return next
      })
    } else if (isExtractingRef.current) {
      isExtractingRef.current = false
      const frames = sessionFramesRef.current
      if (frames.length > 0 && !sessionIncompleteRef.current) {
        const tempAvg = frames.reduce((s, f) => s + f.temp, 0) / frames.length
        const pressAvg = frames.reduce((s, f) => s + f.press, 0) / frames.length
        const last = frames[frames.length - 1]
        const name =
          profiles.find((p) => p.id === last.profile)?.name ?? last.profile ?? 'Sem perfil'
        addHistoryRecord({
          id: `${Date.now()}`,
          date: new Date().toISOString(),
          duration_s: last.timer,
          profileName: name,
          tempAvg,
          pressAvg,
        })
      }
      sessionFramesRef.current = []
      sessionIncompleteRef.current = false
      // limpar grafico apos a extração
      setChartData([])
    }
  }, [currentFrame, addHistoryRecord, profiles])

  const runControl = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError('Erro ao enviar comando: ' + (e as Error).message)
    }
  }

  const frame = currentFrame
  const machineState: MachineState = frame?.state ?? 'idle'
  const isExtracting = machineState === 'extracting'
  // Enquanto aquece para a extração de um perfil a máquina ainda não está
  // "extraindo", mas já há um ciclo em andamento — o botão vira "parar".
  const isRunning = isExtracting || machineState === 'preheating'
  const machineError = lastEvent?.event === 'error' ? lastEvent.msg : null

  const handleToggleExtraction = async () => {
    setError(null)
    try {
      if (isRunning) {
        await stopExtraction()
      } else {
        await startExtraction()
      }
    } catch (e) {
      setError('Erro ao enviar comando: ' + (e as Error).message)
    }
  }

  return (
    <Screen title="ESPresso" showConnection>
      {machineError && (
        <div className="mb-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          <span className="font-semibold">Maquina reportou erro:</span> {machineError}
        </div>
      )}

      {/* Leituras principais */}
      <div className="mb-3">
        <StatCard
          label="Temperatura"
          value={frame ? temp(frame.temp) : '--'}
          target={status ? temp(status.tempSetpoint) : '--'}
          accent="text-roast"
        />
      </div>

      {/* Timer + estado (protagonista durante o shot) */}
      <div className="mb-3 rounded-2xl border border-line bg-cream p-6 text-center shadow-card">
        <div className="text-sm font-medium text-muted">
          {activeProfileName ?? 'Sem perfil'}
        </div>
        <div className="my-2">
          <TimerDisplay seconds={frame?.timer ?? 0} large />
        </div>
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${stateStyle[machineState]}`}
        >
          {connected ? stateLabel[machineState] : 'Offline'}
        </span>
      </div>

      {/* Controles diretos: iluminacao e bomba (rele) */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <ControlToggle
          label="Iluminacao"
          on={!!status?.led}
          disabled={!connected}
          onToggle={() => runControl(() => setLed(!status?.led))}
        />
        <ControlToggle
          label="Bomba"
          on={!!status?.pump}
          // Firmware recusa /api/pump em modo AP (HTTP 409): durante o scan de
          // redes o loop fica bloqueado e o rele so seria espelhado depois.
          disabled={!connected || status?.wifiMode === 'ap'}
          onToggle={() => runControl(() => setPump(!status?.pump))}
        />
      </div>

      {/* Grafico ao vivo */}
      {chartData.length > 0 && (
        <div className="mb-3">
          <LiveChart data={chartData} />
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          {error}
        </div>
      )}

      {/* Start/stop */}
      <button
        onClick={handleToggleExtraction}
        // Firmware recusa start em modo AP (409); stop continua liberado.
        disabled={!connected || (status?.wifiMode === 'ap' && !isRunning)}
        className={`w-full rounded-2xl py-5 text-base font-bold uppercase tracking-wide text-cream shadow-raised transition-colors disabled:opacity-40 disabled:shadow-none ${
          isRunning ? 'bg-brick active:bg-brick/90' : 'bg-mocha active:bg-mocha-dark'
        }`}
      >
        {machineState === 'preheating'
          ? 'Aquecendo... parar'
          : isExtracting
            ? 'Parar extracao'
            : 'Iniciar extracao'}
      </button>
    </Screen>
  )
}

export default DashboardScreen
