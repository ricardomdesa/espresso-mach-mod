import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'
import { useMachineApi } from '../hooks/useMachineApi'
import { useSettings } from '../context/SettingsContext'
import { PIDParams } from '../api/types'
import { validatePID } from '../utils/validators'

const SettingsScreen: React.FC = () => {
  const navigate = useNavigate()
  const { status } = useMachine()
  const { setTemp, setPID } = useMachineApi()
  const { tempUnit, pressureUnit, setTempUnit, setPressureUnit } = useSettings()

  const [tempValue, setTempValue] = useState(92)
  const [pid, setPid] = useState<PIDParams>({ kp: 0, ki: 0, kd: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status) {
      setTempValue(status.tempSetpoint)
      setPid({
        kp: status.tempSetpoint, // NOTE: status nao tem PID ainda — sera adicionado
        ki: 0,
        kd: 0,
      })
    }
  }, [status])

  const handleSaveTemp = async () => {
    try {
      await setTemp(tempValue)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleSavePID = async () => {
    const validation = validatePID(pid)
    if (validation) {
      setError(validation)
      return
    }
    try {
      await setPID(pid)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex min-h-screen flex-col p-4 safe-area-top safe-area-bottom">
      <h1 className="mb-4 text-xl font-bold">Ajustes</h1>

      {/* Setpoint temperatura */}
      <div className="mb-6 rounded-xl bg-neutral-800 p-4">
        <div className="mb-2 text-sm font-medium text-neutral-300">
          Temperatura alvo
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={80}
            max={100}
            step={0.1}
            value={tempValue}
            onChange={(e) => setTempValue(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="w-16 text-right font-mono text-lg">
            {tempValue.toFixed(1)}°C
          </span>
        </div>
        <button
          onClick={handleSaveTemp}
          className="mt-3 w-full rounded-lg py-2 text-sm font-semibold text-neutral-900"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Aplicar temperatura
        </button>
      </div>

      {/* PID */}
      <div className="mb-6 rounded-xl bg-neutral-800 p-4">
        <div className="mb-3 text-sm font-medium text-neutral-300">Parametros PID</div>
        <div className="grid grid-cols-3 gap-3">
          {(['kp', 'ki', 'kd'] as const).map((k) => (
            <div key={k}>
              <label className="mb-1 block text-xs uppercase text-neutral-500">{k}</label>
              <input
                type="number"
                step={0.01}
                value={pid[k]}
                onChange={(e) =>
                  setPid((p) => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))
                }
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-center"
              />
            </div>
          ))}
        </div>
        <button
          onClick={handleSavePID}
          className="mt-3 w-full rounded-lg py-2 text-sm font-semibold text-neutral-900"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Aplicar PID
        </button>
      </div>

      {/* Unidades */}
      <div className="mb-6 rounded-xl bg-neutral-800 p-4">
        <div className="mb-3 text-sm font-medium text-neutral-300">Unidades</div>
        <div className="flex gap-4">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Temperatura</label>
            <select
              value={tempUnit}
              onChange={(e) => setTempUnit(e.target.value as 'celsius' | 'fahrenheit')}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            >
              <option value="celsius">Celsius (°C)</option>
              <option value="fahrenheit">Fahrenheit (°F)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Pressao</label>
            <select
              value={pressureUnit}
              onChange={(e) => setPressureUnit(e.target.value as 'bar' | 'psi')}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            >
              <option value="bar">Bar</option>
              <option value="psi">PSI</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-400">{error}</div>}

      <button
        onClick={() => navigate('/')}
        className="mt-auto w-full rounded-lg bg-neutral-800 py-3 text-sm font-medium hover:bg-neutral-700"
      >
        Voltar
      </button>
    </div>
  )
}

export default SettingsScreen
