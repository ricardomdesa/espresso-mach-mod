import { useCallback, useEffect, useRef, useState } from 'react'
import { ShotRecord } from '../api/types'
import {
  MachineShotData,
  bindExtraction,
  clearAll,
  getIndex,
  getShot,
  removeShot,
  saveShot,
} from '../utils/shotRepository'

/**
 * Substitui `useLocalHistory` (Fase 1, task 6) mantendo a mesma forma:
 * records/loaded/add/remove/updateNotes/clear/reload.
 */
export function useShots() {
  const [records, setRecords] = useState<ShotRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const recordsRef = useRef<ShotRecord[]>([])

  const load = useCallback(async () => {
    const index = await getIndex()
    const shots = await Promise.all(index.map((e) => getShot(e.id)))
    const list = shots.filter((s): s is ShotRecord => s != null)
    recordsRef.current = list
    setRecords(list)
    setLoaded(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const add = useCallback(
    async (data: MachineShotData) => {
      // Unico ponto de juncao maquina/diario (D2): anexa a um rascunho
      // aberto se existir, ou cria um registro novo em pending_review.
      await bindExtraction(data)
      await load()
    },
    [load],
  )

  const remove = useCallback(
    async (id: string) => {
      await removeShot(id)
      await load()
    },
    [load],
  )

  const updateNotes = useCallback(
    async (id: string, notes: string) => {
      const current = recordsRef.current.find((r) => r.id === id)
      if (!current) return
      await saveShot({ ...current, log: { ...current.log, notes } })
      await load()
    },
    [load],
  )

  const clear = useCallback(async () => {
    await clearAll()
    await load()
  }, [load])

  return { records, loaded, add, remove, updateNotes, clear, reload: load }
}
