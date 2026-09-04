import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'
import { useFormatters } from '../utils/formatters'
import { useMachineApi } from '../hooks/useMachineApi'
import { useShots } from '../hooks/useShots'
import Screen from '../components/Screen'
import TimerDisplay from '../components/TimerDisplay'
import LiveChart from '../components/LiveChart'
import { MachineState, MachineStatus, WsFrame } from '../api/types'

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
  <div className="rounded-2xl border border-line bg-cream p-4 text-center shadow-card">
    <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
    <div className={`tabular-live mt-1 text-4xl font-semibold ${accent}`}>{value}</div>
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

// Linha de debug da malha de temperatura (dados via /ws ou /api/status).
// Duty do PID, alvo efetivo e idade da ultima leitura do termopar — util
// pra diagnosticar preheat/failsafe sem serial no PC.
const DebugLine: React.FC<{ frame: WsFrame | null; status: MachineStatus | null }> = ({
  frame,
  status,
}) => {
  const duty = frame?.duty ?? status?.duty
  const target = frame?.target ?? status?.target
  const age = frame?.sensAgeMs ?? status?.sensAgeMs
  const ready = status?.ready
  if (duty == null && target == null && age == null && ready == null) return null
  const stale = age != null && age > 10000
  return (
    <div className="tabular-live mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
      {duty != null && <span>duty {duty.toFixed(0)}%</span>}
      {target != null && <span>alvo {target.toFixed(1)}°C</span>}
      {age != null && (
        <span className={stale ? 'font-semibold text-brick' : ''}>
          sensor {(age / 1000).toFixed(1)}s{stale ? ' (falha)' : ''}
        </span>
      )}
      {ready != null && (
        <span className={ready ? 'font-semibold text-herb' : ''}>
          rele {ready ? 'pronto' : 'aguardando'}
        </span>
      )}
    </div>
  )
}

const DashboardScreen: React.FC = () => {
  const { currentFrame, status, connected, canCommand, lastEvent, profiles, refreshProfiles } =
    useMachine()
  const { temp } = useFormatters()
  const { startExtraction, stopExtraction, setLed, setPump } = useMachineApi()
  const { add: addHistoryRecord } = useShots()

  const [chartData, setChartData] = useState<WsFrame[]>([])
  const [error, setError] = useState<string | null>(null)
  const isExtractingRef = useRef(false)
  const sessionFramesRef = useRef<WsFrame[]>([])
  // Se este componente monta com a extração já em andamento (ex.: navegou
  // para fora e voltou no meio do shot), sessionFramesRef só tem o rabo da
  // sessão — a média não pode ser cruzada com o timer cheio da máquina.
  const sessionIncompleteRef = useRef(false)
  // `profiles` só é lido pra resolver o nome do perfil ao gravar o histórico.
  // Mantido num ref pra NÃO entrar no dep array do efeito de gravação — senão
  // um refreshProfiles() no meio do shot re-dispara o efeito com o mesmo
  // currentFrame e empurra a amostra duas vezes.
  const profilesRef = useRef(profiles)
  useEffect(() => {
    profilesRef.current = profiles
  }, [profiles])

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
          profilesRef.current.find((p) => p.id === last.profile)?.name ??
          last.profile ??
          'Sem perfil'
        // Amostra a curva pra ~120 pontos: 100ms/frame cheio estoura o
        // Preferences com 500 registros guardados. 1 ponto/s ja descreve a
        // oscilacao da caldeira.
        const round1 = (n: number) => Math.round(n * 10) / 10
        const t0 = frames[0].t
        const stride = Math.max(1, Math.ceil(frames.length / 120))
        const samples = frames
          .filter((_, i) => i % stride === 0 || i === frames.length - 1)
          .map((f) => ({
            t: f.t - t0,
            temp: round1(f.temp),
            target: f.target != null ? round1(f.target) : undefined,
          }))
        addHistoryRecord({
          duration_s: last.timer,
          profileName: name,
          tempAvg,
          pressAvg,
          tempTarget: last.target != null ? round1(last.target) : undefined,
          samples,
        })
      }
      sessionFramesRef.current = []
      sessionIncompleteRef.current = false
      // limpar grafico apos a extração
      setChartData([])
    }
  }, [currentFrame, addHistoryRecord])

  const runControl = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError('Erro ao enviar comando: ' + (e as Error).message)
    }
  }

  const frame = currentFrame
  const effectiveTarget =
    frame?.target ?? status?.target ?? status?.tempSetpoint ?? null
  // Cor do número da temperatura segue o relé "pronto" da máquina (já tem
  // histerese no firmware, então não fica piscando): verde no alvo, vermelho
  // aquecendo, neutro quando não há status.
  const tempAccent =
    status?.ready === true
      ? 'text-herb'
      : status?.ready === false
        ? 'text-brick'
        : 'text-roast'
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
          // Alvo efetivo do PID (frame/status.target): em vaporização o firmware
          // mira ~90 °C sem tocar em tempSetpoint, então tempSetpoint daria o
          // número errado durante o vapor — só serve de fallback.
          target={
            effectiveTarget != null ? temp(effectiveTarget) : '--'
          }
          accent={tempAccent}
        />
        <DebugLine frame={frame} status={status} />
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

      {/* Sem codigo de pareamento a maquina recusa tudo que muda estado (401).
          Melhor dizer isso aqui do que deixar cada botao falhar sozinho. */}
      {connected && !canCommand && (
        <Link
          to="/setup"
          className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-cream px-4 py-3 shadow-card active:bg-foam"
        >
          <span className="text-xs leading-relaxed text-muted">
            <span className="font-semibold text-ink">Somente leitura.</span> Sem o codigo
            de pareamento da para ver as leituras, mas nao comandar a maquina.
          </span>
          <span className="shrink-0 text-xs font-semibold text-mocha">Inserir</span>
        </Link>
      )}

      {/* Controles diretos: iluminacao e bomba (rele) */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <ControlToggle
          label="Iluminacao"
          on={!!status?.led}
          disabled={!connected || !canCommand}
          onToggle={() => runControl(() => setLed(!status?.led))}
        />
        <ControlToggle
          label="Bomba"
          on={!!status?.pump}
          // Firmware recusa /api/pump em modo AP (HTTP 409): durante o scan de
          // redes o loop fica bloqueado e o rele so seria espelhado depois.
          disabled={!connected || !canCommand || status?.wifiMode === 'ap'}
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
        disabled={!connected || !canCommand || (status?.wifiMode === 'ap' && !isRunning)}
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
