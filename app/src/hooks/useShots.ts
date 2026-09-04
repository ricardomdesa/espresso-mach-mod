import { useCallback, useEffect, useRef, useState } from 'react'
import { ExtractionRecord, ShotRecord } from '../api/types'
import { getIndex, getShot, removeShot, saveShot } from '../utils/shotRepository'

/**
 * Substitui `useLocalHistory` (Fase 1, task 6) mantendo a mesma forma:
 * records/loaded/add/remove/update/clear/reload. `add`/`update` ainda
 * recebem campos de `ExtractionRecord` no nivel raiz do shot — a migracao
 * desses campos para dentro de `log` (D7) acontece quando PrepScreen e
 * ShotDetailScreen substituirem HistoryScreen na Fase 3.
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
    async (record: ExtractionRecord) => {
      const shot: ShotRecord = {
        ...record,
        schema: 2,
        source: 'machine',
        log: { status: 'done' },
      }
      await saveShot(shot)
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

  const update = useCallback(
    async (id: string, patch: Partial<ExtractionRecord>) => {
      const current = recordsRef.current.find((r) => r.id === id)
      if (!current) return
      await saveShot({ ...current, ...patch })
      await load()
    },
    [load],
  )

  const clear = useCallback(async () => {
    await Promise.all(recordsRef.current.map((r) => removeShot(r.id)))
    await load()
  }, [load])

  return { records, loaded, add, remove, update, clear, reload: load }
}
