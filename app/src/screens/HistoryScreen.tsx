import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalHistory } from '../hooks/useLocalHistory'
import { useFormatters } from '../utils/formatters'

const HistoryScreen: React.FC = () => {
  const navigate = useNavigate()
  const { records, loaded, clear } = useLocalHistory()
  const { temp, timer } = useFormatters()

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-neutral-400">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col p-4 safe-area-top safe-area-bottom">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Historico</h1>
        {records.length > 0 && (
          <button
            onClick={clear}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3">
        {records.length === 0 && (
          <div className="text-center text-neutral-500">
            Nenhuma extraçao registrada ainda.
          </div>
        )}
        {records.map((r) => (
          <div key={r.id} className="rounded-xl bg-neutral-800 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{r.profileName}</span>
              <span className="text-xs text-neutral-500">
                {new Date(r.date).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-neutral-400">
              <div>
                <div className="text-neutral-500">Tempo</div>
                <div>{timer(r.duration_s)}</div>
              </div>
              <div>
                <div className="text-neutral-500">Temp media</div>
                <div>{temp(r.tempAvg)}</div>
              </div>
              <div>
                <div className="text-neutral-500">Pressao media</div>
                <div>{r.pressAvg.toFixed(1)} bar</div>
              </div>
            </div>
            {r.notes && (
              <div className="mt-2 text-xs text-neutral-500 italic">{r.notes}</div>
            )}
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

export default HistoryScreen
