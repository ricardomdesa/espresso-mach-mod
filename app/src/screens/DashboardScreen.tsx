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
  extracting: 'Extraindo',
  error: 'Erro',
}

const stateStyle: Record<MachineState, string> = {
  idle: 'bg-foam text-muted',
  heating: 'bg-roast/10 text-roast',
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

const DashboardScreen: React.FC = () => {
  const { currentFrame, status, connected, lastEvent } = useMachine()
  const { temp, pressure } = useFormatters()
  const { startExtraction, stopExtraction } = useMachineApi()
  const { add: addHistoryRecord } = useLocalHistory()

  const [chartData, setChartData] = useState<WsFrame[]>([])
  const [error, setError] = useState<string | null>(null)
  const isExtractingRef = useRef(false)
  const sessionFramesRef = useRef<WsFrame[]>([])

  useEffect(() => {
    if (!currentFrame) return

    if (currentFrame.state === 'extracting') {
      isExtractingRef.current = true
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
      if (frames.length > 0) {
        const tempAvg = frames.reduce((s, f) => s + f.temp, 0) / frames.length
        const pressAvg = frames.reduce((s, f) => s + f.press, 0) / frames.length
        const last = frames[frames.length - 1]
        addHistoryRecord({
          id: `${Date.now()}`,
          date: new Date().toISOString(),
          duration_s: last.timer,
          profileName: last.profile ?? 'Sem perfil',
          tempAvg,
          pressAvg,
        })
      }
      sessionFramesRef.current = []
      // limpar grafico apos a extração
      setChartData([])
    }
  }, [currentFrame, addHistoryRecord])

  const handleToggleExtraction = async () => {
    setError(null)
    try {
      if (currentFrame?.state === 'extracting') {
        await stopExtraction()
      } else {
        await startExtraction()
      }
    } catch (e) {
      setError('Erro ao enviar comando: ' + (e as Error).message)
    }
  }

  const frame = currentFrame
  const machineState: MachineState = frame?.state ?? 'idle'
  const isExtracting = machineState === 'extracting'
  const machineError = lastEvent?.event === 'error' ? lastEvent.msg : null

  return (
    <Screen title="Philco Mod" showConnection>
      {machineError && (
        <div className="mb-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          <span className="font-semibold">Maquina reportou erro:</span> {machineError}
        </div>
      )}

      {/* Leituras principais */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <StatCard
          label="Temperatura"
          value={frame ? temp(frame.temp) : '--'}
          target={status ? temp(status.tempSetpoint) : '--'}
          accent="text-roast"
        />
        <StatCard
          label="Pressao"
          value={frame ? pressure(frame.press) : '--'}
          target={status ? pressure(status.pressSetpoint) : '--'}
          accent="text-herb"
        />
      </div>

      {/* Timer + estado (protagonista durante o shot) */}
      <div className="mb-3 rounded-2xl border border-line bg-cream p-6 text-center shadow-card">
        <div className="text-sm font-medium text-muted">
          {frame?.profile ?? 'Sem perfil'}
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
        disabled={!connected}
        className={`w-full rounded-2xl py-5 text-base font-bold uppercase tracking-wide text-cream shadow-raised transition-colors disabled:opacity-40 disabled:shadow-none ${
          isExtracting ? 'bg-brick active:bg-brick/90' : 'bg-mocha active:bg-mocha-dark'
        }`}
      >
        {isExtracting ? 'Parar extracao' : 'Iniciar extracao'}
      </button>
    </Screen>
  )
}

export default DashboardScreen
