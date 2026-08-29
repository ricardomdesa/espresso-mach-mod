import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'
import { useMachineApi } from '../hooks/useMachineApi'
import Screen from '../components/Screen'

const ProfilesScreen: React.FC = () => {
  const navigate = useNavigate()
  const { profiles, profilesPending, status, refreshProfiles } = useMachine()
  const { setActiveProfile, deleteProfile } = useMachineApi()
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    refreshProfiles().catch(() => setError('Nao foi possivel carregar os perfis.'))
  }, [refreshProfiles])

  const handleActivate = async (id: string) => {
    setError(null)
    setPendingId(id)
    try {
      await setActiveProfile(id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPendingId(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir o perfil "${name}"?`)) return
    setError(null)
    setPendingId(id)
    try {
      await deleteProfile(id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Screen
      title="Perfis"
      action={
        <button
          onClick={() => navigate('/profiles/new')}
          className="rounded-full bg-mocha px-3.5 py-1.5 text-sm font-semibold text-cream active:bg-mocha-dark"
        >
          + Novo
        </button>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">
          {error}
        </div>
      )}

      {profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-cream/60 px-6 py-12 text-center">
          <div className="text-sm font-medium text-ink">Nenhum perfil ainda</div>
          <p className="mt-1 text-sm text-muted">
            Crie um perfil para automatizar a temperatura e a sequencia da bomba na extracao.
          </p>
          <button
            onClick={() => navigate('/profiles/new')}
            className="mt-4 rounded-xl bg-mocha px-4 py-2.5 text-sm font-semibold text-cream active:bg-mocha-dark"
          >
            Criar primeiro perfil
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {profiles.map((p) => {
            const isActive = status?.profile === p.name || status?.profile === p.id
            const busy = pendingId === p.id
            const unsynced = profilesPending[p.id]
            return (
              <li
                key={p.id}
                className={`rounded-2xl border bg-cream p-4 shadow-card ${
                  isActive ? 'border-mocha' : 'border-line'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink">{p.name}</span>
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-mocha/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-mocha">
                          Ativo
                        </span>
                      )}
                      {unsynced && (
                        <span className="shrink-0 rounded-full bg-brick/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brick">
                          Nao sincronizado
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="mt-0.5 truncate text-sm text-muted">{p.description}</p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {typeof p.temperature_c === 'number' ? `${p.temperature_c} °C · ` : ''}
                      {p.steps.length} passo(s)
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <button
                    onClick={() => handleActivate(p.id)}
                    disabled={busy || isActive}
                    className="flex-1 rounded-lg bg-mocha px-3 py-2 text-xs font-semibold text-cream active:bg-mocha-dark disabled:opacity-40"
                  >
                    {isActive ? 'Em uso' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => navigate(`/profiles/${p.id}/edit`)}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-foam px-3 py-2 text-xs font-semibold text-ink active:bg-line disabled:opacity-40"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    disabled={busy}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-brick active:bg-brick/10 disabled:opacity-40"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Screen>
  )
}

export default ProfilesScreen
