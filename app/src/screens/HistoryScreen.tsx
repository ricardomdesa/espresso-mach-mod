import React from 'react'
import { useLocalHistory } from '../hooks/useLocalHistory'
import { useFormatters } from '../utils/formatters'
import Screen from '../components/Screen'

const HistoryScreen: React.FC = () => {
  const { records, loaded, clear } = useLocalHistory()
  const { temp, timer } = useFormatters()

  const handleClear = () => {
    if (!confirm('Apagar todo o historico de extracoes?')) return
    clear()
  }

  return (
    <Screen
      title="Historico"
      action={
        records.length > 0 ? (
          <button
            onClick={handleClear}
            className="text-sm font-medium text-brick active:opacity-70"
          >
            Limpar
          </button>
        ) : undefined
      }
    >
      {!loaded ? (
        <div className="py-16 text-center text-sm text-muted">Carregando...</div>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-cream/60 px-6 py-12 text-center">
          <div className="text-sm font-medium text-ink">Nenhuma extracao ainda</div>
          <p className="mt-1 text-sm text-muted">
            As extracoes feitas pelo app aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {records.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-cream p-4 shadow-card">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold text-ink">{r.profileName}</span>
                <span className="shrink-0 text-xs text-muted">
                  {new Date(r.date).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted">Tempo</div>
                  <div className="tabular-live mt-0.5 text-sm font-semibold text-ink">
                    {timer(r.duration_s)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted">Temp media</div>
                  <div className="tabular-live mt-0.5 text-sm font-semibold text-roast">
                    {temp(r.tempAvg)}
                  </div>
                </div>
              </div>

              {r.notes && <p className="mt-2 text-xs italic text-muted">{r.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}

export default HistoryScreen
