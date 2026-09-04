import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen'
import NumberField from '../components/NumberField'
import GrindStepper from '../components/GrindStepper'
import { useDraft } from '../hooks/useDraft'
import { getIndex } from '../utils/shotRepository'
import { ShotLog } from '../api/types'

const distributionOptions: { value: NonNullable<ShotLog['distribution']>; label: string }[] = [
  { value: 'none', label: 'Nenhuma' },
  { value: 'wdt', label: 'WDT' },
  { value: 'tap', label: 'Batidinhas' },
]

const PrepScreen: React.FC = () => {
  const navigate = useNavigate()
  const { draft, loaded, open, update, discard, completeManual } = useDraft()
  const [previousGrind, setPreviousGrind] = useState<string | undefined>()
  const [manualOpen, setManualOpen] = useState(false)
  const [manualSeconds, setManualSeconds] = useState(25)
  const [busy, setBusy] = useState(false)

  // Sem rascunho aberto ainda (chegou aqui direto, sem passar pelo DraftChip):
  // cria um na hora (RF-01/D3 — openDraft ja recusa um segundo).
  useEffect(() => {
    if (loaded && !draft) open({}).catch(() => {})
  }, [loaded, draft, open])

  // So como referencia visual no GrindStepper (D10) — nao e prefill (RF-05/D6
  // ficam pra fase de linhagem).
  useEffect(() => {
    getIndex().then((index) => {
      const last = index.find((e) => e.status === 'done')
      setPreviousGrind(last?.grindSetting)
    })
  }, [])

  const handleDiscard = async () => {
    if (!confirm('Descartar este rascunho e as fotos que ele ja tem?')) return
    setBusy(true)
    try {
      await discard()
      navigate('/')
    } finally {
      setBusy(false)
    }
  }

  const handleCompleteManual = async () => {
    setBusy(true)
    try {
      await completeManual(manualSeconds)
      navigate('/')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded || !draft) {
    return (
      <Screen title="Preparo" showNav={false}>
        <div className="py-16 text-center text-sm text-muted">Carregando...</div>
      </Screen>
    )
  }

  const log = draft.log

  return (
    <Screen
      title="Preparo"
      showNav={false}
      action={
        <button
          onClick={handleDiscard}
          disabled={busy}
          className="text-sm font-medium text-brick active:opacity-70 disabled:opacity-40"
        >
          Descartar
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Moagem
          </label>
          <GrindStepper
            value={log.grindSetting ?? ''}
            previous={previousGrind}
            onChange={(v) => update({ grindSetting: v })}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Dose
          </label>
          <div className="flex items-baseline gap-2">
            <NumberField
              value={log.doseG ?? 0}
              onChange={(n) => update({ doseG: n })}
              min={0}
              ariaLabel="Dose em gramas"
              className="tabular-live w-24 rounded-xl border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none focus:border-mocha"
            />
            <span className="text-sm text-muted">g</span>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Distribuicao
          </label>
          <div className="flex gap-2">
            {distributionOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ distribution: opt.value })}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  (log.distribution ?? 'none') === opt.value
                    ? 'bg-mocha text-cream'
                    : 'bg-foam text-muted active:bg-line'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => navigate('/')}
        className="mt-6 w-full rounded-2xl bg-mocha py-4 text-sm font-bold uppercase tracking-wide text-cream shadow-raised active:bg-mocha-dark"
      >
        Pronto pra extrair
      </button>

      {!manualOpen ? (
        <button
          onClick={() => setManualOpen(true)}
          className="mt-3 w-full rounded-2xl border border-dashed border-line-strong py-3 text-sm font-medium text-muted active:bg-foam"
        >
          Concluir sem curva
        </button>
      ) : (
        <div className="mt-3 rounded-2xl border border-line bg-cream p-4 shadow-card">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Tempo da extracao (s)
          </label>
          <div className="flex items-center gap-2">
            <NumberField
              value={manualSeconds}
              onChange={setManualSeconds}
              min={0}
              ariaLabel="Tempo da extracao em segundos"
              className="tabular-live w-24 rounded-xl border border-line bg-latte px-3 py-2.5 text-sm text-ink outline-none focus:border-mocha"
            />
            <span className="text-sm text-muted">s</span>
            <button
              onClick={handleCompleteManual}
              disabled={busy}
              className="ml-auto rounded-xl bg-mocha px-4 py-2.5 text-sm font-bold text-cream disabled:opacity-40"
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </Screen>
  )
}

export default PrepScreen
