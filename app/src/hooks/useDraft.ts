import { useCallback, useEffect, useRef, useState } from 'react'
import { ShotLog, ShotRecord } from '../api/types'
import {
  completeWithoutCurve,
  discardDraft,
  getDraft,
  openDraft,
  saveShot,
} from '../utils/shotRepository'

/** Rascunho aberto (D3): ler, criar, atualizar campo a campo, descartar, concluir sem curva. */
export function useDraft() {
  // undefined = ainda carregando; null = sem rascunho aberto.
  const [draft, setDraft] = useState<ShotRecord | null | undefined>(undefined)
  // Encadeia os saves campo-a-campo: sem isso, dois onChange em sequencia
  // rapida (ex.: dois digitos de dose) disparam saveShot() concorrentes e o
  // que resolver por ultimo no bridge nativo pode nao ser o mais recente,
  // revertendo o rascunho persistido pra um valor mais antigo (RF-04).
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())

  const load = useCallback(async () => {
    const d = await getDraft()
    setDraft(d)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const open = useCallback(async (seed: Partial<ShotLog>) => {
    const d = await openDraft(seed)
    setDraft(d)
    return d
  }, [])

  // Grava a cada mudanca de campo: o rascunho precisa sobreviver ao app
  // sendo morto a qualquer momento (RF-04), nao so ao sair da tela.
  const update = useCallback((patch: Partial<ShotLog>) => {
    setDraft((prev) => {
      if (!prev) return prev
      const next: ShotRecord = { ...prev, log: { ...prev.log, ...patch } }
      saveQueueRef.current = saveQueueRef.current.then(() => saveShot(next)).catch(() => {})
      return next
    })
  }, [])

  const discard = useCallback(async () => {
    await discardDraft()
    setDraft(null)
  }, [])

  const completeManual = useCallback(async (durationS: number) => {
    const shot = await completeWithoutCurve(durationS)
    setDraft(null)
    return shot
  }, [])

  return { draft, open, update, discard, completeManual, reload: load }
}
