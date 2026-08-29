import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExtractionProfile, ProfileStep } from '../api/types'
import { useMachine } from '../context/MachineContext'
import { useMachineApi } from '../hooks/useMachineApi'
import {
  validateProfile,
  PROFILE_TEMP_MIN,
  PROFILE_TEMP_MAX,
} from '../utils/validators'
import Screen from '../components/Screen'
import NumberField from '../components/NumberField'
import { chartColors } from '../theme'

const emptyProfile: Omit<ExtractionProfile, 'id'> = {
  name: '',
  description: '',
  temperature_c: 92,
  steps: [{ seconds: 3, pump: true }],
}

/** Linha do tempo read-only: cada passo vira um segmento proporcional à duração;
 *  preenchido = bomba ligada, vazado = bomba desligada. */
const StepTimeline: React.FC<{ steps: ProfileStep[] }> = ({ steps }) => {
  const total = Math.max(
    steps.reduce((s, st) => s + (st.seconds > 0 ? st.seconds : 0), 0),
    1,
  )
  return (
    <div>
      <div className="flex h-10 w-full overflow-hidden rounded-lg border border-line">
        {steps.map((st, i) => (
          <div
            key={i}
            className="h-full border-r border-cream/60 last:border-r-0"
            style={{
              width: `${((st.seconds > 0 ? st.seconds : 0) / total) * 100}%`,
              backgroundColor: st.pump ? chartColors.temp : 'transparent',
            }}
            title={`Passo ${i + 1}: ${st.pump ? 'bomba ligada' : 'bomba desligada'} por ${st.seconds}s`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>0s</span>
        <span>{total.toFixed(0)}s total</span>
      </div>
    </div>
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
      // Perfis antigos (curva de pressão) não têm os campos novos; completa com
      // defaults para o editor não quebrar.
      setProfile({
        name: rest.name ?? '',
        description: rest.description ?? '',
        temperature_c: rest.temperature_c ?? emptyProfile.temperature_c,
        steps:
          Array.isArray(rest.steps) && rest.steps.length > 0
            ? rest.steps.map((s) => ({
                seconds: typeof s.seconds === 'number' ? s.seconds : 1,
                pump: typeof s.pump === 'boolean' ? s.pump : true,
              }))
            : emptyProfile.steps,
      })
      setNotFound(false)
    } else if (!loadError) {
      // Só é "não encontrado" de fato quando o carregamento deu certo e o
      // perfil simplesmente não está na lista — uma falha de rede não pode
      // virar essa mensagem.
      setNotFound(true)
    }
  }, [isEditing, id, profiles, loadingProfile, loadError])

  const updateStep = (index: number, patch: Partial<ProfileStep>) => {
    setProfile((prev) => {
      const steps = [...prev.steps]
      steps[index] = { ...steps[index], ...patch }
      return { ...prev, steps }
    })
  }

  const addStep = () => {
    setProfile((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        // Alterna o estado da bomba em relação ao último passo (padrão de
        // pré-infusão: liga / desliga / liga).
        { seconds: 5, pump: !(prev.steps[prev.steps.length - 1]?.pump ?? false) },
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

      {/* Temperatura alvo (vira setpoint ao iniciar) */}
      <div className="mt-5 rounded-2xl border border-line bg-cream p-4 shadow-card">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Temperatura alvo
          </span>
          <span className="text-xs text-muted">
            {PROFILE_TEMP_MIN}-{PROFILE_TEMP_MAX} °C
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <NumberField
            value={profile.temperature_c}
            onChange={(n) => setProfile((p) => ({ ...p, temperature_c: n }))}
            min={PROFILE_TEMP_MIN}
            max={PROFILE_TEMP_MAX}
            ariaLabel="Temperatura alvo"
            className="tabular-live w-24 rounded-lg border border-line bg-latte px-2 py-1.5 text-sm text-ink outline-none focus:border-mocha"
          />
          <span className="text-sm text-muted">°C</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Ao iniciar, a maquina aquece ate esta temperatura e so entao roda os passos.
        </p>
      </div>

      {/* Prévia da sequência */}
      <div className="mt-5 rounded-2xl border border-line bg-cream p-4 shadow-card">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Sequencia da bomba
        </div>
        <StepTimeline steps={profile.steps} />
      </div>

      {/* Steps */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Passos</span>
          <span className="text-xs text-muted">duracao / bomba</span>
        </div>

        <div className="space-y-2">
          {profile.steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-line bg-cream p-3 shadow-card"
            >
              <span className="w-5 shrink-0 text-xs font-semibold text-muted">{i + 1}</span>
              <div className="flex items-center gap-1">
                <NumberField
                  value={step.seconds}
                  onChange={(n) => updateStep(i, { seconds: n })}
                  min={0}
                  ariaLabel={`Duração do passo ${i + 1} em segundos`}
                  className="tabular-live w-16 rounded-lg border border-line bg-latte px-2 py-1.5 text-sm text-ink outline-none focus:border-mocha"
                />
                <span className="text-xs text-muted">s</span>
              </div>
              <button
                type="button"
                onClick={() => updateStep(i, { pump: !step.pump })}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  step.pump
                    ? 'bg-mocha text-cream active:bg-mocha-dark'
                    : 'bg-foam text-muted active:bg-line'
                }`}
              >
                {step.pump ? 'Bomba ligada' : 'Bomba desligada'}
              </button>
              {profile.steps.length > 1 && (
                <button
                  onClick={() => removeStep(i)}
                  aria-label={`Remover passo ${i + 1}`}
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
            + Adicionar passo
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
