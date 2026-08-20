import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'
import { useMachineApi } from '../hooks/useMachineApi'

const ProfilesScreen: React.FC = () => {
  const navigate = useNavigate()
  const { profiles, refreshProfiles } = useMachine()
  const { setActiveProfile, deleteProfile } = useMachineApi()

  useEffect(() => {
    refreshProfiles()
  }, [refreshProfiles])

  const handleActivate = async (id: string) => {
    try {
      await setActiveProfile(id)
    } catch (e) {
      alert('Erro: ' + (e as Error).message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este perfil?')) return
    try {
      await deleteProfile(id)
    } catch (e) {
      alert('Erro: ' + (e as Error).message)
    }
  }

  return (
    <div className="flex min-h-screen flex-col p-4 safe-area-top safe-area-bottom">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Perfis de Extraçao</h1>
        <button
          onClick={() => navigate('/profiles/new')}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-neutral-900"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          + Novo
        </button>
      </div>

      <div className="flex-1 space-y-3">
        {profiles.length === 0 && (
          <div className="text-center text-neutral-500">Nenhum perfil criado ainda.</div>
        )}
        {profiles.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl bg-neutral-800 p-4"
          >
            <div>
              <div className="font-semibold">{p.name}</div>
              {p.description && (
                <div className="text-xs text-neutral-400">{p.description}</div>
              )}
              <div className="mt-1 text-xs text-neutral-500">
                {p.steps.length} step(s)
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleActivate(p.id)}
                className="rounded-md bg-neutral-700 px-3 py-1.5 text-xs font-medium hover:bg-neutral-600"
              >
                Ativar
              </button>
              <button
                onClick={() => navigate(`/profiles/${p.id}/edit`)}
                className="rounded-md bg-neutral-700 px-3 py-1.5 text-xs font-medium hover:bg-neutral-600"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(p.id)}
                className="rounded-md bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/60"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate('/')}
        className="mt-4 w-full rounded-lg bg-neutral-800 py-3 text-sm font-medium hover:bg-neutral-700"
      >
        Voltar
      </button>
    </div>
  )
}

export default ProfilesScreen
