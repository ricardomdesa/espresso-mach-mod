import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getIndex } from '../utils/shotRepository'

/**
 * Conta de shots em `pending_review` para o badge da BottomNav (RF-10/item 12).
 * Le so o indice (leve); reroda a cada troca de rota, ja que a BottomNav
 * remonta com a tela.
 */
export function usePendingReviewCount(): number {
  const { pathname } = useLocation()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    getIndex().then((index) => {
      if (cancelled) return
      setCount(index.filter((e) => e.status === 'pending_review').length)
    })
    return () => {
      cancelled = true
    }
  }, [pathname])

  return count
}
