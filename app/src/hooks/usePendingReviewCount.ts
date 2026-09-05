import { useCallback, useEffect, useState } from 'react'
import { getIndex, onIndexChange } from '../utils/shotRepository'

/**
 * Conta de shots em `pending_review` para o badge da BottomNav (RF-10/item 12).
 * Le so o indice (leve); reroda em qualquer escrita de indice (onIndexChange),
 * nao so em troca de rota — uma extracao pode virar pending_review sem sair
 * da tela atual (ex.: no proprio Dashboard).
 */
export function usePendingReviewCount(): number {
  const [count, setCount] = useState(0)

  const refresh = useCallback(() => {
    getIndex().then((index) => {
      setCount(index.filter((e) => e.status === 'pending_review').length)
    })
  }, [])

  useEffect(() => {
    refresh()
    return onIndexChange(refresh)
  }, [refresh])

  return count
}
