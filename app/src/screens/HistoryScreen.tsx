import React, { useState } from 'react'
import { useLocalHistory } from '../hooks/useLocalHistory'
import { useFormatters } from '../utils/formatters'
import Screen from '../components/Screen'
import LiveChart from '../components/LiveChart'
import { ExtractionRecord } from '../api/types'

interface HistoryItemProps {
  record: ExtractionRecord
  onSaveNotes: (id: string, notes: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

const HistoryItem: React.FC<HistoryItemProps> = ({ record: r, onSaveNotes, onRemove }) => {
  const { temp, timer } = useFormatters()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(r.notes ?? '')
  const [saving, setSaving] = useState(false)

  const dirty = draft.trim() !== (r.notes ?? '').trim()
  const hasChart = !!r.samples && r.samples.length > 1

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSaveNotes(r.id, draft.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-cream p-4 shadow-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="truncate font-semibold text-ink">{r.profileName}</span>
        <span className="shrink-0 text-xs text-muted">
          {new Date(r.date).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </button>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
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
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Alvo</div>
          <div className="tabular-live mt-0.5 text-sm font-semibold text-muted">
            {r.tempTarget != null ? temp(r.tempTarget) : '--'}
          </div>
        </div>
      </div>

      {!open ? (
        r.notes && <p className="mt-2 line-clamp-2 text-xs italic text-muted">{r.notes}</p>
      ) : (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {hasChart ? (
            <LiveChart data={r.samples!} showTarget={r.tempTarget != null} />
          ) : (
            <p className="text-xs text-muted">Sem curva de temperatura para esta extracao.</p>
          )}

          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted">
              Descricao
            </label>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Moagem, dose, sabor, ajustes..."
              className="mt-1 w-full rounded-xl border border-line bg-foam px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-mocha focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => onRemove(r.id)}
                className="text-xs font-medium text-brick active:opacity-70"
              >
                Apagar
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="rounded-xl bg-mocha px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-cream disabled:opacity-40"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

const HistoryScreen: React.FC = () => {
  const { records, loaded, update, remove, clear } = useLocalHistory()

  const handleClear = () => {
    if (!confirm('Apagar todo o historico de extracoes?')) return
    clear()
  }

  const handleSaveNotes = (id: string, notes: string) => update(id, { notes })

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
            <HistoryItem
              key={r.id}
              record={r}
              onSaveNotes={handleSaveNotes}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
    </Screen>
  )
}

export default HistoryScreen
