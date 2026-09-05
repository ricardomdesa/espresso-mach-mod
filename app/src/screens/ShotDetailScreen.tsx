import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Screen from '../components/Screen'
import NumberField from '../components/NumberField'
import LiveChart from '../components/LiveChart'
import PhotoPicker from '../components/PhotoPicker'
import TasteTags from '../components/TasteTags'
import { getShot, removeShot, saveShot } from '../utils/shotRepository'
import { flowRate, ratio } from '../utils/derived'
import { errorMessage } from '../utils/errors'
import { useFormatters } from '../utils/formatters'
import { ShotLog, ShotPhoto, ShotRecord, TasteTag } from '../api/types'

const RATING_VALUES = [1, 2, 3, 4, 5]

/** Avaliacao de um shot (RF-12/13): curva, sabor, fotos, nota, proxima mudanca. */
const ShotDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { timer } = useFormatters()

  const [shot, setShot] = useState<ShotRecord | null | undefined>(undefined)
  const [yieldG, setYieldG] = useState(0)
  const [firstDropS, setFirstDropS] = useState(0)
  const [taste, setTaste] = useState<TasteTag[]>([])
  const [channeling, setChanneling] = useState(false)
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')
  const [nextChange, setNextChange] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getShot(id).then((s) => {
      setShot(s)
      if (!s) return
      setYieldG(s.log.yieldG ?? 0)
      setFirstDropS(s.log.firstDropS ?? 0)
      setTaste(s.log.taste ?? [])
      setChanneling(!!s.log.channeling)
      setRating(s.log.rating ?? 0)
      setNotes(s.log.notes ?? '')
      setNextChange(s.log.nextChange ?? '')
    })
  }, [id])

  // Fotos persistem na hora: a captura ja gravou o arquivo em disco (D4), e o
  // registro precisa apontar pra ele mesmo se o app for morto antes do
  // "Salvar avaliacao" — igual ao autosave do rascunho (useDraft).
  const handlePhotosChange = (photos: ShotPhoto[]) => {
    if (!shot) return
    const next: ShotRecord = { ...shot, log: { ...shot.log, photos } }
    setShot(next)
    saveShot(next).catch((e) => setError('Erro ao salvar foto: ' + errorMessage(e)))
  }

  const handleSave = async () => {
    if (!shot) return
    setBusy(true)
    setError(null)
    try {
      const log: ShotLog = {
        ...shot.log,
        yieldG: yieldG || undefined,
        firstDropS: firstDropS || undefined,
        taste,
        channeling,
        rating: rating || undefined,
        notes: notes.trim() || undefined,
        nextChange: nextChange.trim() || undefined,
        status: 'done',
      }
      await saveShot({ ...shot, log })
      navigate('/history')
    } catch (e) {
      setError('Erro ao salvar: ' + errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!shot || !confirm('Apagar este shot e suas fotos?')) return
    setBusy(true)
    setError(null)
    try {
      await removeShot(shot.id)
      navigate('/history')
    } catch (e) {
      setError('Erro ao apagar: ' + errorMessage(e))
      setBusy(false)
    }
  }

  if (shot === undefined) {
    return (
      <Screen title="Shot" showNav={false}>
        <div className="py-16 text-center text-sm text-muted">Carregando...</div>
      </Screen>
    )
  }
  if (shot === null) {
    return (
      <Screen title="Shot" showNav={false}>
        <div className="py-16 text-center text-sm text-muted">Shot nao encontrado.</div>
      </Screen>
    )
  }

  const hasChart = !!shot.samples && shot.samples.length > 1
  const r = ratio(shot.log.doseG, yieldG)
  const flow = flowRate(yieldG, shot.duration_s)
  const legacyNotes = shot.log.legacyNotes ?? shot.notes

  return (
    <Screen
      title="Avaliar shot"
      showNav={false}
      action={
        <button
          onClick={handleRemove}
          disabled={busy}
          className="text-sm font-medium text-brick active:opacity-70 disabled:opacity-40"
        >
          Apagar
        </button>
      }
    >
      {error && (
        <div className="mb-3 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          {error}
        </div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2 rounded-2xl border border-line bg-cream p-4 shadow-card">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Moagem</div>
          <div className="mt-0.5 text-sm font-semibold text-ink">
            {shot.log.grindSetting ?? '--'}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Dose</div>
          <div className="mt-0.5 text-sm font-semibold text-ink">
            {shot.log.doseG != null ? `${shot.log.doseG} g` : '--'}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Tempo</div>
          <div className="tabular-live mt-0.5 text-sm font-semibold text-ink">
            {timer(shot.duration_s)}
          </div>
        </div>
      </div>

      {legacyNotes && (
        <div className="mb-3 rounded-2xl border border-line-strong bg-foam/60 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Anotacao original
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{legacyNotes}</p>
        </div>
      )}

      {hasChart && (
        <div className="mb-3">
          <LiveChart data={shot.samples!} showTarget={shot.tempTarget != null} />
        </div>
      )}

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              Yield
            </label>
            <div className="flex items-baseline gap-2">
              <NumberField
                value={yieldG}
                onChange={setYieldG}
                min={0}
                ariaLabel="Yield em gramas"
                className="tabular-live w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none focus:border-mocha"
              />
              <span className="text-sm text-muted">g</span>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              1a gota
            </label>
            <div className="flex items-baseline gap-2">
              <NumberField
                value={firstDropS}
                onChange={setFirstDropS}
                min={0}
                ariaLabel="Tempo ate a primeira gota em segundos"
                className="tabular-live w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none focus:border-mocha"
              />
              <span className="text-sm text-muted">s</span>
            </div>
          </div>
        </div>

        {/* Ratio e vazao: exibidos, nunca persistidos (D9). */}
        {(r != null || flow != null) && (
          <div className="flex gap-4 text-xs text-muted">
            {r != null && <span>ratio 1:{r.toFixed(1)}</span>}
            {flow != null && <span>vazao {flow.toFixed(1)} g/s</span>}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Sabor
          </label>
          <TasteTags value={taste} onChange={setTaste} />
        </div>

        <button
          type="button"
          onClick={() => setChanneling((v) => !v)}
          className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left shadow-card transition-colors ${
            channeling ? 'border-brick bg-brick/10' : 'border-line bg-cream'
          }`}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Canalizacao
          </span>
          <span
            className={`ml-2 inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
              channeling ? 'bg-brick' : 'bg-line'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-cream shadow transition-transform ${
                channeling ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Nota
          </label>
          <div className="flex gap-2">
            {RATING_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setRating(v === rating ? 0 : v)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
                  rating >= v ? 'bg-mocha text-cream' : 'bg-foam text-muted active:bg-line'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Observacoes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Como saiu o shot..."
            className="w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-mocha focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Mudar na proxima (RF-06)
          </label>
          <textarea
            value={nextChange}
            onChange={(e) => setNextChange(e.target.value)}
            rows={2}
            placeholder="Ex: moer um pouco mais fino"
            className="w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-mocha focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Fotos
          </label>
          <PhotoPicker shotId={shot.id} photos={shot.log.photos ?? []} onChange={handlePhotosChange} />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={busy}
        className="mt-6 w-full rounded-2xl bg-mocha py-4 text-sm font-bold uppercase tracking-wide text-cream shadow-raised active:bg-mocha-dark disabled:opacity-40"
      >
        Salvar avaliacao
      </button>
    </Screen>
  )
}

export default ShotDetailScreen
