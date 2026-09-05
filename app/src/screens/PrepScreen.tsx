import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen'
import NumberField from '../components/NumberField'
import GrindStepper from '../components/GrindStepper'
import PhotoPicker from '../components/PhotoPicker'
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
  const { draft, open, update, discard, completeManual, reload } = useDraft()
  const [previousGrind, setPreviousGrind] = useState<string | undefined>()
  const [manualOpen, setManualOpen] = useState(false)
  const [manualSeconds, setManualSeconds] = useState(25)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sem rascunho aberto ainda (chegou aqui direto, sem passar pelo DraftChip):
  // cria um na hora (RF-01/D3 — openDraft ja recusa um segundo). Se abrir
  // falhar por outra instancia ja ter criado o rascunho (race), recarrega em
  // vez de deixar a tela presa em "Carregando..." pra sempre.
  useEffect(() => {
    if (draft === null) open({}).catch(() => reload())
  }, [draft, open, reload])

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
    setError(null)
    try {
      await discard()
      navigate('/')
    } catch (e) {
      setError('Erro ao descartar: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleCompleteManual = async () => {
    setBusy(true)
    setError(null)
    try {
      await completeManual(manualSeconds)
      navigate('/')
    } catch (e) {
      setError('Erro ao concluir: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (draft === undefined || draft === null) {
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            disabled={busy}
            className="text-sm font-medium text-muted active:opacity-70 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleDiscard}
            disabled={busy}
            className="text-sm font-medium text-brick active:opacity-70 disabled:opacity-40"
          >
            Descartar
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-3 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Nome (opcional)
          </label>
          <input
            type="text"
            value={log.label ?? ''}
            onChange={(e) => update({ label: e.target.value || undefined })}
            placeholder="Ex: bourbon lavado dia 2"
            className="w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-mocha"
          />
        </div>

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

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Fotos
          </label>
          <PhotoPicker
            shotId={draft.id}
            photos={log.photos ?? []}
            onChange={(photos) => update({ photos })}
          />
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
