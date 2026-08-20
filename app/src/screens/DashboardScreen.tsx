import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'
import { useFormatters } from '../utils/formatters'
import { useMachineApi } from '../hooks/useMachineApi'
import ConnectionBadge from '../components/ConnectionBadge'
import TimerDisplay from '../components/TimerDisplay'
import LiveChart from '../components/LiveChart'
import { WsFrame } from '../api/types'

const DashboardScreen: React.FC = () => {
  const navigate = useNavigate()
  const { currentFrame, status, connected } = useMachine()
  const { temp, pressure } = useFormatters()
  const { startExtraction, stopExtraction } = useMachineApi()

  const [chartData, setChartData] = useState<WsFrame[]>([])
  const isExtractingRef = useRef(false)

  useEffect(() => {
    if (!currentFrame) return

    if (currentFrame.state === 'extracting') {
      isExtractingRef.current = true
      setChartData((prev) => {
        const next = [...prev, currentFrame]
        // manter ultimos 30s de dados (a 100ms = 300 pontos)
        if (next.length > 300) return next.slice(-300)
        return next
      })
    } else if (isExtractingRef.current) {
      isExtractingRef.current = false
      // limpar grafico apos a extração
      setChartData([])
    }
  }, [currentFrame])

  const handleToggleExtraction = async () => {
    try {
      if (currentFrame?.state === 'extracting') {
        await stopExtraction()
      } else {
        await startExtraction()
      }
    } catch (e) {
      alert('Erro ao enviar comando: ' + (e as Error).message)
    }
  }

  const frame = currentFrame

  return (
    <div className="flex min-h-screen flex-col p-4 safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <ConnectionBadge />
      </div>

      {/* Dados principais */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-neutral-800 p-4">
          <div className="text-xs text-neutral-400">Temperatura</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-accent)' }}>
            {frame ? temp(frame.temp) : '--'}
          </div>
          <div className="text-xs text-neutral-500">
            alvo: {status ? temp(status.tempSetpoint) : '--'}
          </div>
        </div>
        <div className="rounded-xl bg-neutral-800 p-4">
          <div className="text-xs text-neutral-400">Pressao</div>
          <div className="text-2xl font-bold text-green-400">
            {frame ? pressure(frame.press) : '--'}
          </div>
          <div className="text-xs text-neutral-500">
            alvo: {status ? pressure(status.pressSetpoint) : '--'}
          </div>
        </div>
      </div>

      {/* Timer + Perfil */}
      <div className="mb-4 rounded-xl bg-neutral-800 p-4 text-center">
        <div className="mb-1 text-xs text-neutral-400">
          {frame?.profile ?? 'Sem perfil'}
        </div>
        <TimerDisplay seconds={frame?.timer ?? 0} large />
        <div className="mt-2 text-xs uppercase tracking-wide text-neutral-500">
          {frame?.state ?? 'offline'}
        </div>
      </div>

      {/* Grafico */}
      {chartData.length > 0 && (
        <div className="mb-4">
          <LiveChart data={chartData} />
        </div>
      )}

      {/* Start/Stop */}
      <button
        onClick={handleToggleExtraction}
        disabled={!connected}
        className={`mb-4 w-full rounded-xl py-4 text-lg font-bold text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-50 ${
          frame?.state === 'extracting' ? 'bg-red-500' : ''
        }`}
        style={
          frame?.state === 'extracting'
            ? {}
            : { backgroundColor: 'var(--color-accent)' }
        }
      >
        {frame?.state === 'extracting' ? 'PARAR EXTRAÇAO' : 'INICIAR EXTRAÇAO'}
      </button>

      {/* Navegação */}
      <div className="mt-auto grid grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/profiles')}
          className="rounded-lg bg-neutral-800 py-3 text-sm font-medium hover:bg-neutral-700"
        >
          Perfis
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="rounded-lg bg-neutral-800 py-3 text-sm font-medium hover:bg-neutral-700"
        >
          Ajustes
        </button>
        <button
          onClick={() => navigate('/history')}
          className="rounded-lg bg-neutral-800 py-3 text-sm font-medium hover:bg-neutral-700"
        >
          Historico
        </button>
      </div>
    </div>
  )
}

export default DashboardScreen
