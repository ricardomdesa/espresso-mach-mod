import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExtractionProfile, ProfileStep } from '../api/types'
import { useMachineApi } from '../hooks/useMachineApi'
import { validateProfile } from '../utils/validators'

const emptyProfile: Omit<ExtractionProfile, 'id'> = {
  name: '',
  description: '',
  steps: [{ time_s: 0, pressure_bar: 0 }],
}

const ProfileEditorScreen: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isEditing = Boolean(id)
  const { createProfile, updateProfile } = useMachineApi()

  const [profile, setProfile] = useState<Omit<ExtractionProfile, 'id'>>(emptyProfile)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      steps: [...prev.steps, { time_s: prev.steps[prev.steps.length - 1]?.time_s ?? 0, pressure_bar: 0 }],
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

  return (
    <div className="flex min-h-screen flex-col p-4 safe-area-top safe-area-bottom">
      <h1 className="mb-4 text-xl font-bold">
        {isEditing ? 'Editar Perfil' : 'Novo Perfil'}
      </h1>

      <div className="mb-4 space-y-3">
        <div>
          <label className="mb-1 block text-sm text-neutral-400">Nome</label>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            placeholder="Ex: Espresso Padrao"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-400">Descriçao</label>
          <input
            type="text"
            value={profile.description}
            onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            placeholder="Opcional"
          />
        </div>
      </div>

      <div className="mb-2 text-sm font-medium text-neutral-300">Steps (tempo / pressao)</div>
      <div className="mb-4 space-y-2">
        {profile.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-neutral-800 p-3">
            <span className="w-6 text-xs text-neutral-500">{i + 1}</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={step.time_s}
              onChange={(e) => updateStep(i, 'time_s', parseFloat(e.target.value) || 0)}
              className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
              placeholder="s"
            />
            <span className="text-neutral-500">s</span>
            <input
              type="number"
              min={0}
              max={12}
              step={0.1}
              value={step.pressure_bar}
              onChange={(e) => updateStep(i, 'pressure_bar', parseFloat(e.target.value) || 0)}
              className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
              placeholder="bar"
            />
            <span className="text-neutral-500">bar</span>
            {profile.steps.length > 1 && (
              <button
                onClick={() => removeStep(i)}
                className="ml-auto text-xs text-red-400 hover:text-red-300"
              >
                Remover
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addStep}
          className="w-full rounded-lg border border-dashed border-neutral-600 py-2 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-200"
        >
          + Adicionar step
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-400">{error}</div>}

      <div className="mt-auto flex gap-3">
        <button
          onClick={() => navigate('/profiles')}
          className="flex-1 rounded-lg bg-neutral-800 py-3 text-sm font-medium hover:bg-neutral-700"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg py-3 text-sm font-bold text-neutral-900 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

export default ProfileEditorScreen
