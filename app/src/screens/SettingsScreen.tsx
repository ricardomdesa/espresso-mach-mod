import React, { useState, useEffect } from 'react'
import { useMachine } from '../context/MachineContext'
import { useMachineApi } from '../hooks/useMachineApi'
import { useSettings } from '../context/SettingsContext'
import { PIDParams } from '../api/types'
import { validatePID } from '../utils/validators'
import Screen from '../components/Screen'

type Feedback = { kind: 'ok' | 'error'; msg: string } | null

const SettingsScreen: React.FC = () => {
  const { status, connected } = useMachine()
  const { setTemp, setPID } = useMachineApi()
  const { tempUnit, setTempUnit } = useSettings()

  const [tempValue, setTempValue] = useState(92)
  const [pid, setPid] = useState<PIDParams>({ kp: 0, ki: 0, kd: 0 })
  const [feedback, setFeedback] = useState<Feedback>(null)

  useEffect(() => {
    if (status) {
      setTempValue(status.tempSetpoint)
      setPid(status.pid)
    }
  }, [status])

  const handleSaveTemp = async () => {
    try {
      await setTemp(tempValue)
      setFeedback({ kind: 'ok', msg: 'Temperatura aplicada.' })
    } catch (e) {
      setFeedback({ kind: 'error', msg: (e as Error).message })
    }
  }

  const handleSavePID = async () => {
    const validation = validatePID(pid)
    if (validation) {
      setFeedback({ kind: 'error', msg: validation })
      return
    }
    try {
      await setPID(pid)
      setFeedback({ kind: 'ok', msg: 'PID aplicado.' })
    } catch (e) {
      setFeedback({ kind: 'error', msg: (e as Error).message })
    }
  }

  const cardClass = 'rounded-2xl border border-line bg-cream p-4 shadow-card'
  const sectionTitle = 'text-xs font-medium uppercase tracking-wide text-muted'
  const applyBtn =
    'mt-4 w-full rounded-xl bg-mocha py-2.5 text-sm font-semibold text-cream active:bg-mocha-dark disabled:opacity-40'
  const selectClass =
    'w-full rounded-xl border border-line bg-latte px-3 py-2.5 text-sm text-ink outline-none focus:border-mocha'

  return (
    <Screen title="Ajustes" showConnection>
      {!connected && (
        <div className="mb-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-muted shadow-card">
          Máquina offline. Você pode ver os ajustes, mas aplicar temperatura e
          PID só funciona com ela conectada.
        </div>
      )}

      {/* Setpoint temperatura */}
      <div className={cardClass}>
        <div className={sectionTitle}>Temperatura alvo</div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="tabular-live text-4xl font-semibold text-roast">
            {tempValue.toFixed(1)}
            <span className="ml-1 text-lg text-muted">°C</span>
          </span>
          <span className="text-xs text-muted">20 - 110 °C</span>
        </div>
        <input
          type="range"
          min={20}
          max={110}
          step={0.1}
          value={tempValue}
          onChange={(e) => setTempValue(parseFloat(e.target.value))}
          className="mt-3 w-full accent-mocha"
        />
        <button onClick={handleSaveTemp} disabled={!connected} className={applyBtn}>
          Aplicar temperatura
        </button>
      </div>

      {/* PID */}
      <div className={`${cardClass} mt-4`}>
        <div className={sectionTitle}>Parametros PID</div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {(['kp', 'ki', 'kd'] as const).map((k) => (
            <div key={k}>
              <label className="mb-1.5 block text-center text-xs font-semibold uppercase text-muted">
                {k}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step={0.01}
                value={pid[k]}
                onChange={(e) =>
                  setPid((p) => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))
                }
                className="tabular-live w-full rounded-xl border border-line bg-latte px-2 py-2.5 text-center text-sm text-ink outline-none focus:border-mocha"
              />
            </div>
          ))}
        </div>
        <button onClick={handleSavePID} disabled={!connected} className={applyBtn}>
          Aplicar PID
        </button>
      </div>

      {/* Unidades */}
      <div className={`${cardClass} mt-4`}>
        <div className={sectionTitle}>Unidades</div>
        <div className="mt-3">
          <label className="mb-1.5 block text-xs text-muted">Temperatura</label>
          <select
            value={tempUnit}
            onChange={(e) => setTempUnit(e.target.value as 'celsius' | 'fahrenheit')}
            className={selectClass}
          >
            <option value="celsius">Celsius (°C)</option>
            <option value="fahrenheit">Fahrenheit (°F)</option>
          </select>
        </div>
      </div>

      {/* Informações da máquina */}
      <div className={`${cardClass} mt-4`}>
        <div className={sectionTitle}>Maquina</div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted">Endereco IP</dt>
            <dd className="tabular-live font-medium text-ink">{status?.ip || '--'}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Modo Wi-Fi</dt>
            <dd className="font-medium text-ink">
              {status?.wifiMode === 'sta'
                ? 'Rede local'
                : status?.wifiMode === 'ap'
                  ? 'Configuracao (AP)'
                  : status?.wifiMode === 'offline'
                    ? 'Offline'
                    : '--'}
            </dd>
          </div>
        </dl>
      </div>

      {feedback && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            feedback.kind === 'ok'
              ? 'border-herb/30 bg-herb/10 text-herb'
              : 'border-brick/30 bg-brick/10 text-brick'
          }`}
        >
          {feedback.msg}
        </div>
      )}
    </Screen>
  )
}

export default SettingsScreen
