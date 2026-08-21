import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExtractionProfile, ProfileStep } from '../api/types'
import { useMachine } from '../context/MachineContext'
import { useMachineApi } from '../hooks/useMachineApi'
import { validateProfile } from '../utils/validators'
import Screen from '../components/Screen'
import { chartColors } from '../theme'

const emptyProfile: Omit<ExtractionProfile, 'id'> = {
  name: '',
  description: '',
  steps: [{ time_s: 0, pressure_bar: 0 }],
}

const MAX_PRESSURE_BAR = 12

/** Previa read-only da curva pressao x tempo montada pelos steps. */
const CurvePreview: React.FC<{ steps: ProfileStep[] }> = ({ steps }) => {
  const w = 300
  const h = 96
  const maxTime = Math.max(...steps.map((s) => s.time_s), 1)
  const points = steps
    .map((s) => {
      const x = (s.time_s / maxTime) * w
      const y = h - (Math.min(s.pressure_bar, MAX_PRESSURE_BAR) / MAX_PRESSURE_BAR) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
      <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke={chartColors.grid} strokeWidth="1" />
      <polyline
        points={points}
        fill="none"
        stroke={chartColors.press}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

const ProfileEditorScreen: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isEditing = Boolean(id)
  const { profiles, refreshProfiles } = useMachine()
  const { createProfile, updateProfile } = useMachineApi()

  const [profile, setProfile] = useState<Omit<ExtractionProfile, 'id'>>(emptyProfile)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(isEditing)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!isEditing || !id) return
    let cancelled = false
    setLoadingProfile(true)
    setLoadError(false)
    refreshProfiles()
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!isEditing || !id || loadingProfile) return
    const existing = profiles.find((p) => p.id === id)
    if (existing) {
      const { id: _unused, ...rest } = existing
      setProfile(rest)
      setNotFound(false)
    } else if (!loadError) {
      // Só é "não encontrado" de fato quando o carregamento deu certo e o
      // perfil simplesmente não está na lista — uma falha de rede não pode
      // virar essa mensagem.
      setNotFound(true)
    }
  }, [isEditing, id, profiles, loadingProfile, loadError])

  const updateStep = (index: number, field: keyof ProfileStep, value: number) => {
    setProfile((prev) => {
      const steps = [...prev.steps]
      steps[index] = { ...steps[index], [field]: value }
      return { ...prev, steps }
    })
  }

  const addStep = () => {
    setProfile((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          time_s: (prev.steps[prev.steps.length - 1]?.time_s ?? 0) + 1,
          pressure_bar: 0,
        },
      ],
    }))
  }

  const removeStep = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }))
  }

  const handleSave = async () => {
    const validation = validateProfile(profile)
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (isEditing && id) {
        await updateProfile(id, profile)
      } else {
        await createProfile(profile)
      }
      navigate('/profiles')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loadingProfile) {
    return (
      <Screen title="Editar Perfil" showNav={false}>
        <div className="py-16 text-center text-sm text-muted">Carregando...</div>
      </Screen>
    )
  }

  if (loadError) {
    return (
      <Screen title="Editar Perfil" showNav={false}>
        <div className="rounded-2xl border border-line bg-cream px-6 py-12 text-center shadow-card">
          <div className="text-sm font-medium text-ink">Erro ao carregar perfil</div>
          <p className="mt-1 text-sm text-muted">
            Nao foi possivel falar com a maquina. Verifique a conexao e tente de novo.
          </p>
          <button
            onClick={() => navigate('/profiles')}
            className="mt-4 rounded-xl bg-mocha px-4 py-2.5 text-sm font-semibold text-cream active:bg-mocha-dark"
          >
            Voltar aos perfis
          </button>
        </div>
      </Screen>
    )
  }

  if (notFound) {
    return (
      <Screen title="Editar Perfil" showNav={false}>
        <div className="rounded-2xl border border-line bg-cream px-6 py-12 text-center shadow-card">
          <div className="text-sm font-medium text-ink">Perfil nao encontrado</div>
          <p className="mt-1 text-sm text-muted">
            Ele pode ter sido removido da maquina.
          </p>
          <button
            onClick={() => navigate('/profiles')}
            className="mt-4 rounded-xl bg-mocha px-4 py-2.5 text-sm font-semibold text-cream active:bg-mocha-dark"
          >
            Voltar aos perfis
          </button>
        </div>
      </Screen>
    )
  }

  const inputClass =
    'w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-mocha'

  return (
    <Screen
      title={isEditing ? 'Editar Perfil' : 'Novo Perfil'}
      showNav={false}
      action={
        <button
          onClick={() => navigate('/profiles')}
          className="text-sm font-medium text-muted active:text-ink"
        >
          Cancelar
        </button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Nome
          </label>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            className={inputClass}
            placeholder="Ex: Espresso Padrao"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Descricao
          </label>
          <input
            type="text"
            value={profile.description ?? ''}
            onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))}
            className={inputClass}
            placeholder="Opcional"
          />
        </div>
      </div>

      {/* Previa da curva */}
      <div className="mt-5 rounded-2xl border border-line bg-cream p-4 shadow-card">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Curva de pressao
          </span>
          <span className="text-xs text-muted">0-{MAX_PRESSURE_BAR} bar</span>
        </div>
        <CurvePreview steps={profile.steps} />
      </div>

      {/* Steps */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Steps
          </span>
          <span className="text-xs text-muted">tempo / pressao</span>
        </div>

        <div className="space-y-2">
          {profile.steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-line bg-cream p-3 shadow-card"
            >
              <span className="w-5 shrink-0 text-xs font-semibold text-muted">{i + 1}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  value={step.time_s}
                  onChange={(e) => updateStep(i, 'time_s', parseFloat(e.target.value) || 0)}
                  className="tabular-live w-16 rounded-lg border border-line bg-latte px-2 py-1.5 text-sm text-ink outline-none focus:border-mocha"
                />
                <span className="text-xs text-muted">s</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_PRESSURE_BAR}
                  step={0.1}
                  value={step.pressure_bar}
                  onChange={(e) =>
                    updateStep(i, 'pressure_bar', parseFloat(e.target.value) || 0)
                  }
                  className="tabular-live w-16 rounded-lg border border-line bg-latte px-2 py-1.5 text-sm text-ink outline-none focus:border-mocha"
                />
                <span className="text-xs text-muted">bar</span>
              </div>
              {profile.steps.length > 1 && (
                <button
                  onClick={() => removeStep(i)}
                  aria-label={`Remover step ${i + 1}`}
                  className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-brick active:bg-brick/10"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addStep}
            className="w-full rounded-xl border border-dashed border-line-strong py-2.5 text-sm font-medium text-muted active:bg-foam"
          >
            + Adicionar step
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-5 w-full rounded-2xl bg-mocha py-4 text-sm font-bold uppercase tracking-wide text-cream shadow-raised active:bg-mocha-dark disabled:opacity-40"
      >
        {saving ? 'Salvando...' : 'Salvar perfil'}
      </button>
    </Screen>
  )
}

export default ProfileEditorScreen
