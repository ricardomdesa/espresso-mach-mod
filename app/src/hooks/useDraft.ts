import { useCallback, useEffect, useState } from 'react'
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
  const [draft, setDraft] = useState<ShotRecord | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const d = await getDraft()
    setDraft(d)
    setLoaded(true)
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
      saveShot(next).catch(() => {})
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

  return { draft, loaded, open, update, discard, completeManual, reload: load }
}
