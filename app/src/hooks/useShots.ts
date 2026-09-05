import { useCallback } from 'react'
import { MachineShotData, bindExtraction } from '../utils/shotRepository'

/**
 * Ponte entre a extracao ao vivo (DashboardScreen) e o diario. Historico e
 * avaliacao leem o indice/shards direto de `shotRepository` (RNF-01) — este
 * hook nao carrega a lista inteira, so encaminha o que a maquina produziu.
 */
export function useShots() {
  const add = useCallback(async (data: MachineShotData) => {
    // Unico ponto de juncao maquina/diario (D2): anexa a um rascunho
    // aberto se existir, ou cria um registro novo em pending_review.
    await bindExtraction(data)
  }, [])

  return { add }
}
