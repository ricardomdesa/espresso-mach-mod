import React, { useCallback, useEffect, useState } from 'react'
import Screen from '../components/Screen'
import ShotCard from '../components/ShotCard'
import { ShotIndexEntry } from '../api/types'
import { clearAll, getIndex, onIndexChange } from '../utils/shotRepository'

/**
 * Le so o indice (RF-20/RNF-01): nenhuma curva ou foto carrega so pra
 * desenhar a lista. Reroda em qualquer escrita de indice, nao so ao entrar
 * na tela — mesma fonte que `usePendingReviewCount`.
 */
function useShotIndex() {
  const [index, setIndex] = useState<ShotIndexEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(() => {
    getIndex().then((list) => {
      setIndex(list)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    refresh()
    return onIndexChange(refresh)
  }, [refresh])

  return { index, loaded }
}

const HistoryScreen: React.FC = () => {
  const { index, loaded } = useShotIndex()

  const handleClear = () => {
    if (!confirm('Apagar todo o historico de extracoes?')) return
    clearAll()
  }

  return (
    <Screen
      title="Historico"
      action={
        index.length > 0 ? (
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
      ) : index.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-cream/60 px-6 py-12 text-center">
          <div className="text-sm font-medium text-ink">Nenhuma extracao ainda</div>
          <p className="mt-1 text-sm text-muted">
            As extracoes feitas pelo app aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {index.map((entry) => (
            <li key={entry.id}>
              <ShotCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}

export default HistoryScreen
